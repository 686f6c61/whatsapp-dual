# Changelog

All notable changes to WhatsApp Dual will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
