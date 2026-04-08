# Changelog

All notable changes to WhatsApp Dual will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.1] - 2026-04-09

### Fixed

- **Packaged startup**: Hardened `electron-store` constructor resolution so installed desktop builds start correctly even when Electron wraps the module export differently from development
- **Desktop launcher**: Prevented the installed Linux launcher from failing immediately with `Store is not a constructor`

### Quality

- **Regression coverage**: Added focused tests for the packaged `electron-store` export shapes seen in production bundles
- **Release packaging**: Switched project build scripts to a traversal-based `electron-builder` wrapper to avoid npm collector failures during Linux packaging

## [1.5.0] - 2026-04-08

### Improved

- **PIN flow polish**: Refined PIN setup and update flow so current-PIN verification, long PIN entry, and unlock behaviour feel consistent end-to-end
- **Inactivity handling**: Improved auto-lock responsiveness by resetting the timer from real activity inside WhatsApp views instead of relying on static timers alone
- **Theme controls**: Added an explicit theme selector in Settings and tightened theme persistence when saving preferences
- **Notifications**: Refined permission handling so desktop notifications stay limited to trusted WhatsApp origins while the rest of the permission surface remains locked down

### Security

- **Runtime refresh**: Updated Electron and project dependencies to their latest stable versions and refreshed transitive overrides
- **Sandbox defaults**: Restored Chromium sandboxing as the default runtime path while keeping an explicit compatibility fallback for environments that need it
- **IPC hardening**: Expanded sender validation across settings, lock, and activity channels
- **Session handling**: Tightened recursive session file operations to avoid following symbolic links outside the intended storage tree

### Quality

- **Coverage refresh**: Added targeted tests for permission allowlisting, auto-lock timer lifecycle, and recursive session scanning
- **Dependency maintenance**: Regenerated lockfile and left the npm audit report clean at release time

## [1.4.0] - 2026-03-19

### Security

- **Path traversal fix**: `i18n:getTranslationsForLanguage` now validates the `lang` parameter with a strict regex and verifies the resolved path stays within the locales directory
- **Sandbox on main window**: Added `sandbox: true` to the main BrowserWindow webPreferences
- **Permission handler**: Added `setPermissionRequestHandler` to block camera, microphone, and geolocation requests from WhatsApp Web views
- **Settings validation**: `updateSecuritySettings` now validates types and ranges for all fields (booleans, integers within bounds)
- **Paranoia mode**: Now shows a confirmation dialog before deleting sessions (previously deleted immediately)
- **Listener cleanup**: `preload-settings.js` now calls `removeAllListeners` before registering `once` to prevent listener accumulation

### Fixed

- **Theme persistence**: `settings:save` now persists the theme setting to the store
- **Auto-submit overlap**: Lock screen clears previous auto-submit timer before setting a new one
- **i18n state mutation**: `getTranslationsForLanguage` reads the locale file directly instead of mutating the global i18n state
- **Power monitor settings**: `lockOnSuspend` and `lockOnScreenLock` are now checked at event time, not at registration time, so changes take effect without restart
- **Window bounds**: Added `useContentSize: true` to prevent the menu bar from clipping the bottom of the WhatsApp view

### Changed

- **Architecture**: Split `main.js` (893 lines) into 4 focused modules: `main.js` (286), `window-manager.js` (319), `view-manager.js` (331), `ipc-handlers.js` (198)
- **Architecture**: Split `security.js` (909 lines) into facade + 3 sub-modules: `pin-manager.js` (345), `lock-controller.js` (166), `session-protection.js` (341)
- **Singleton store**: Single `electron-store` instance created in `main.js` and injected into all modules via `initStore()`
- **Menu API**: `createMenu()` now accepts an options object instead of 6 positional parameters
- **Comment fix**: Updated main.js header from "BrowserView" to "WebContentsView"

### Added

- **Unit tests**: 22 tests with Vitest covering PIN management, verification, lockout, settings validation
- **SECURITY.md**: Responsible disclosure policy, security architecture, known limitations
- **Test infrastructure**: `vitest.config.js`, `tests/setup.js` with Electron mocking via Module patching

### Documentation

- **README.md**: Updated project structure to reflect new modular architecture
- **CONTRIBUTING.md**: Updated project structure, key files table, Node.js 22, removed `@version` from header template, added `npm run dev` and `npm test`

## [1.3.0] - 2026-03-02

### Security

- **Electron 39**: Updated from Electron 33 to 39, resolving 13 npm vulnerabilities including ASAR bypass and tar path traversal
- **electron-builder 26**: Updated from 25.1.8 to 26.x
- **electron-updater 6.8**: Updated from 6.3.9 to 6.8.3
- **IPC sender validation**: Added `validateSender` check to `verifyPIN` handler (was missing unlike other mutating handlers)
- **IPC type validation**: All mutating IPC handlers now verify argument types (`typeof pin === 'string'`, `typeof settings === 'object'`)
- **Settings input validation**: `settings:save` now validates language against available languages list, defaultAccount against whitelist, and booleans against type
- **Lock window sandbox**: Both lock screen and PIN setup windows now run with `sandbox: true`
- **CSP frame-src**: Added `frame-src 'none'` to Content Security Policy on settings.html, lock.html, and lock-setup.html
- **Listener leak fix**: Changed `ipcRenderer.on('security:pinSetupDone')` to `ipcRenderer.once()` in preload-settings to prevent listener accumulation
- **SHA256 checksums**: Release workflow now generates and publishes SHA256SUMS.txt for all artifacts

### Changed

- **BrowserView -> WebContentsView**: Migrated from deprecated `BrowserView` API to `WebContentsView` with `contentView.addChildView()`/`removeChildView()` pattern
- **Node.js 22**: CI workflow updated from Node 20 to Node 22
- **Copyright**: Updated copyright year range to 2024-2026
- **postinst.sh**: Connected existing post-install script to electron-builder deb configuration

### Improved

- **Module-level helpers**: Extracted `quitApp()` and `reloadActiveView()` from `createWindow()` closure to module scope, eliminating duplicate definitions in `settings:save`
- **powerMonitor guard**: Added `powerMonitorInitialized` flag to prevent duplicate `suspend`/`lock-screen` listener registration

### Removed

- **Dead renderer files**: Removed `index.html`, `renderer.js`, `theme.js`, `renderer/js/i18n.js`, and `main.css` (never loaded by mainWindow)
- **Dead IPC handlers**: Removed `switch-account`, `get-current-account`, `open-settings`, `open-about`, `settings-changed`, `quit-app` (only called from dead renderer.js)
- **Dead constant**: Removed `SHORTCUTS` from constants.js (unused since v1.2.1 removed global shortcuts)
- **Dead preload listener**: Removed `settings.onChanged` from preload-settings.js (`settings-updated` channel was never sent)
- **Version tags**: Removed per-file `@version` JSDoc tags (version tracked in package.json only)

## [1.2.1] - 2026-01-26

### Security

- **Settings contextIsolation**: Settings window now uses `contextIsolation: true` with a secure preload script instead of `nodeIntegration: true`
- **Lock screen bypass prevention**: Settings window cannot be opened while the lock screen is active
- **PIN removal verification**: Removing PIN now always requires entering the current PIN first
- **IPC sender validation**: Security-sensitive IPC handlers validate that requests come from known application windows
- **BrowserView sandboxing**: WhatsApp views now run with `sandbox: true` for additional process isolation
- **URL scheme allowlist**: External link handler only allows `https:` and `http:` schemes, blocking `file://`, `javascript:`, etc.
- **CSP hardening**: Removed `'unsafe-inline'` from `style-src` in all HTML files; inline styles replaced with CSS classes

### Fixed

- **Tray account switching**: Account switching from the system tray now works correctly (was using incorrect IPC event name)
- **Quit from tray/menu**: Quit now properly sets the quitting flag, preventing minimize-to-tray from blocking the quit operation
- **Menu Reload**: Reload now reloads the active WhatsApp BrowserView instead of the main window frame
- **Lock screen initialization**: Lock screen now checks for lockout status on load, showing the lockout timer if applicable
- **PIN setup race condition**: Settings window now uses a completion callback instead of `setTimeout` to detect PIN setup completion

### Changed

- **No global shortcuts**: Removed system-wide `globalShortcut` registrations that could conflict with other applications; menu accelerators provide the same functionality
- **BrowserView factory**: Deduplicated BrowserView creation code into a shared `createAccountView()` function
- **Dynamic User-Agent**: Chrome version in User-Agent string now matches the actual Electron Chrome version
- **Deprecated API cleanup**: Replaced deprecated `getBrowserView()`/`setBrowserView()` with `getBrowserViews()`/`addBrowserView()`
- **Object.hasOwn**: Replaced `hasOwnProperty()` calls with the modern `Object.hasOwn()` static method

### Improved

- **Lock screen i18n**: Lock screen and PIN setup screen now support translations via the preload i18n API
- **DOM null safety**: Added null checks for DOM elements in the main renderer to prevent runtime errors
- **Error handling**: Added `.catch()` to all `shell.openExternal()` calls; improved error logging in file permission operations
- **PIN auto-submit debounce**: Added debounce flag to prevent double-submission during PIN auto-submit
- **Dead code removal**: Removed unused functions (`setMainWindow`, `hasUnreadMessages`, `getUpdateInfo`, `removePINNoVerify`)
- **Deduplicated show listener**: Consolidated two `mainWindow.on('show')` listeners into one

## [1.2.0] - 2026-01-26

### Added

- **File Downloads**: Files from WhatsApp Web now download properly
  - Native "Save As" dialog appears when downloading images, documents, audio, and video
  - Works independently for both Personal and Business accounts

## [1.1.9] - 2026-01-08

### Fixed

- **Window Sizing**: Fix initial BrowserView bounds on Linux

## [1.1.8] - 2026-01-08

### Fixed

- **Single Instance**: Fixed window restore when app is hidden in tray

## [1.1.7] - 2026-01-08

### Fixed

- **Single Instance**: Clicking the app icon now focuses the existing window instead of opening duplicates

## [1.1.6] - 2026-01-07

### Fixed

- **External URLs**: Links now open in the default system browser instead of inside the app

## [1.1.5] - 2026-01-06

### Added

- **Tray Notification Indicator**: Visual indicator in the system tray when you have unread messages
  - Tray icon changes to message icon when any account has unread messages
  - Automatically detects unread messages from page title
  - Returns to normal icon when all messages are read
  - Works with both Personal and Business accounts

## [1.1.0] - 2026-01-05

### Added

- **PIN Protection**: Secure your WhatsApp sessions with a 4-8 digit PIN
  - PBKDF2-SHA512 hashing with 100,000 iterations
  - Secure storage using OS keychain (libsecret on Linux)
  - PIN required on app startup when enabled
- **Auto-Lock**: Automatically lock the application after inactivity
  - Configurable timeout from 1-30 minutes (default: 5 minutes)
  - Lock on system suspend
  - Lock on screen lock
- **Quick Lock**: Lock application instantly with Ctrl+L or from Settings menu
- **Brute Force Protection**: Progressive delays after failed PIN attempts
  - No delay for first 3 attempts
  - 5 second delay after 4-5 attempts
  - 30 second delay after 6-7 attempts
  - 5 minute delay after 8-9 attempts
  - 30 minute lockout after 10+ attempts
- **Paranoia Mode**: Optional automatic session deletion after max failed attempts
  - Uses secure 3-pass random data overwrite
  - Ensures complete data destruction
- **Lock Screen UI**: Modern numpad interface for PIN entry
  - Visual feedback for PIN input
  - Lockout countdown timer
  - Forgot PIN with full reset option
- **Security Settings Panel**: Complete configuration in Settings window
  - PIN setup, change, and removal
  - Auto-lock configuration
  - Advanced security options

### Changed

- Settings window height increased to accommodate security panel
- Menu now includes "Lock now" option when PIN is enabled

### Security

- PIN never stored in plain text
- Session data protected from unauthorized access
- No backdoor or recovery mechanism by design

## [1.0.3] - 2025-01-05

### Added

- **Auto-update system**: The application now checks for updates automatically and notifies users when a new version is available
- **Update indicator**: Red dot appears in the Help menu and tray when an update is available
- **Keyboard shortcuts dialog**: View all shortcuts from Help menu
- **Professional documentation**: Comprehensive JSDoc documentation across all source files

### Changed

- Updated Electron from version 28 to 33 for improved performance and security
- Updated electron-builder to version 25.1.8
- Updated electron-updater to version 6.3.9
- Updated electron-store to version 8.2.0
- Improved code organization with section separators and comments

### Fixed

- Fixed sandbox error on Linux with Electron 33+ by adding `--no-sandbox` flag

## [1.0.2] - 2025-01-04

### Added

- **Internationalization (i18n)**: Full support for multiple languages
- **Spanish translation**: Complete Spanish language support
- **Language selector**: Change language from Settings without restart
- **Real-time language preview**: See translation changes immediately in Settings

### Changed

- Menu now uses localized strings
- Tray menu now uses localized strings
- Settings window fully localized

## [1.0.1] - 2025-01-03

### Added

- **System tray integration**: Minimize to tray and quick access menu
- **Minimize to tray option**: Keep app running in background when closed
- **Start minimized option**: Launch directly to system tray
- **Quick account switching from tray**: Switch accounts without opening window

### Fixed

- Window state persistence improvements
- Memory usage optimizations

## [1.0.0] - 2025-01-02

### Added

- **Initial release** of WhatsApp Dual
- **Dual account support**: Run WhatsApp Personal and Business simultaneously
- **Session isolation**: Complete separation using Electron BrowserView partitions
- **Account switching**: Quick switch with Ctrl+1 and Ctrl+2
- **Settings window**: Configure default account and startup behavior
- **Dark/Light theme**: Automatic theme detection following system preference
- **Native notifications**: Separate notifications for each account
- **Auto-start**: Option to launch with system
- **Linux packages**: .deb, .AppImage, and .snap formats

### Technical

- Built with Electron 28
- Uses BrowserView with `persist:` partitions for session isolation
- electron-store for settings persistence
- electron-builder for packaging

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 1.5.1 | 2026-04-09 | Packaged startup fix for installed desktop builds |
| 1.5.0 | 2026-04-08 | Runtime refresh, sandbox defaults, PIN flow polish, dependency maintenance |
| 1.4.0 | 2026-03-19 | Modular architecture, 22 unit tests, security fixes, SECURITY.md |
| 1.3.0 | 2026-03-02 | Electron 39, WebContentsView, security audit fixes, dead code removal |
| 1.2.1 | 2026-01-26 | Security hardening, bug fixes, code quality |
| 1.2.0 | 2026-01-26 | File downloads |
| 1.1.5 | 2026-01-06 | Tray notification indicator for unread messages |
| 1.1.0 | 2026-01-05 | PIN protection, auto-lock, security features |
| 1.0.3 | 2025-01-05 | Auto-updates, Electron 33, documentation |
| 1.0.2 | 2025-01-04 | Internationalization, Spanish support |
| 1.0.1 | 2025-01-03 | System tray integration |
| 1.0.0 | 2025-01-02 | Initial release |

## Upgrade Notes

### From 1.1.0 to 1.1.5

No manual intervention required. The tray notification indicator works automatically.

### From 1.0.3 to 1.1.0

No manual intervention required. Security features are optional and disabled by default. To enable PIN protection, go to Settings > Security and set up a PIN.

### From 1.0.2 to 1.0.3

No manual intervention required. The application will prompt you to restart to install updates when available.

### From 1.0.1 to 1.0.2

No manual intervention required. Your settings will be preserved.

### From 1.0.0 to 1.0.1

No manual intervention required. Your login sessions will be preserved.
