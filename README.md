# WhatsApp Dual

Use WhatsApp Personal and WhatsApp Business simultaneously in a single desktop application for Linux. WhatsApp Dual provides a seamless experience for users who need to manage both personal and business communications without the hassle of switching between browser tabs or using multiple devices.

## Features

WhatsApp Dual is designed to enhance productivity for users who rely on both WhatsApp Personal and WhatsApp Business. Each feature has been carefully implemented to provide a native desktop experience that integrates smoothly with your Linux workflow.

- **Dual Accounts**: Run WhatsApp Personal and Business simultaneously with complete session isolation
- **Quick Switching**: Change between accounts instantly with `Ctrl+1` (Personal) and `Ctrl+2` (Business)
- **PIN Protection**: Secure your sessions with a 4-8 digit PIN using PBKDF2 encryption
- **Auto-Lock**: Automatically lock after inactivity, system suspend, or screen lock
- **System Tray Integration**: Minimize to the system tray and keep running in the background
- **Tray Notification Indicator**: Visual indicator in the tray icon when you have unread messages
- **Theme Support**: Follows your system's dark/light preference automatically
- **Multi-language**: Interface available in English and Spanish, with easy addition of new languages
- **Native Notifications**: Receive desktop notifications for each account separately
- **Auto-start**: Optionally launch with your system, with the option to start minimized
- **Auto-updates**: Get notified when new versions are available and update seamlessly

## How It Works

Understanding how WhatsApp Dual achieves session isolation helps appreciate why you can safely use both accounts without any interference between them.

### Account Isolation Architecture

WhatsApp Dual uses Electron's BrowserView technology combined with isolated session partitions to ensure complete separation between your Personal and Business accounts. This architecture provides several key benefits:

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp Dual Window                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────┐   ┌─────────────────────┐         │
│   │   BrowserView       │   │   BrowserView       │         │
│   │   (Personal)        │   │   (Business)        │         │
│   │                     │   │                     │         │
│   │   Session:          │   │   Session:          │         │
│   │   persist:personal  │   │   persist:business  │         │
│   │                     │   │                     │         │
│   │   - Own cookies     │   │   - Own cookies     │         │
│   │   - Own storage     │   │   - Own storage     │         │
│   │   - Own cache       │   │   - Own cache       │         │
│   └─────────────────────┘   └─────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Technical Details:**

- **Session Partitions**: Each account runs in its own `persist:` partition (`persist:whatsapp-personal` and `persist:whatsapp-business`), which means cookies, localStorage, sessionStorage, and cache are completely separate.

- **Data Persistence**: The `persist:` prefix ensures that your login sessions survive application restarts. You only need to scan the QR code once per account.

- **No Cross-Contamination**: Because sessions are isolated, actions in one account (like logging out, clearing data, or changing settings) have zero effect on the other account.

- **Privacy**: Each account has its own isolated storage, so Personal and Business data never mix.

## Installation

WhatsApp Dual offers multiple installation methods to suit different preferences. Choose the one that best fits your needs and Linux distribution.

### Option 1: Debian Package (Recommended for Ubuntu/Debian)

The `.deb` package is the recommended installation method for Ubuntu, Debian, Linux Mint, and other Debian-based distributions. It provides automatic dependency resolution and integrates with your system's package manager.

```bash
# Download the latest release
wget https://github.com/686f6c61/whatsapp-dual/releases/latest/download/whatsapp-dual_1.1.5_amd64.deb

# Install the package
sudo dpkg -i whatsapp-dual_1.1.5_amd64.deb

# If you encounter dependency issues, run:
sudo apt-get install -f
```

### Option 2: AppImage (Universal Linux)

AppImage provides a distribution-agnostic format that works on most Linux systems without installation. Simply download, make executable, and run.

```bash
# Download the AppImage
wget https://github.com/686f6c61/whatsapp-dual/releases/latest/download/WhatsAppDual-1.1.5-x86_64.AppImage

# Make it executable
chmod +x WhatsAppDual-1.1.5-x86_64.AppImage

# Run the application
./WhatsAppDual-1.1.5-x86_64.AppImage
```

### Option 3: Build from Source

For developers or users who prefer to build from source, the process is straightforward with npm.

```bash
# Clone the repository
git clone https://github.com/686f6c61/whatsapp-dual.git
cd whatsapp-dual

# Install dependencies
npm install

# Run in development mode
npm start

# Build for Linux (creates .deb, .AppImage, and .snap)
npm run build:linux
```

## Keyboard Shortcuts

Keyboard shortcuts provide quick access to the most common actions, allowing you to work efficiently without reaching for the mouse.

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Switch to Personal account |
| `Ctrl+2` | Switch to Business account |
| `Ctrl+,` | Open Settings |
| `Ctrl+L` | Lock application (when PIN enabled) |
| `Ctrl+R` | Reload current view |
| `Ctrl+Q` | Quit application |

## Settings

The settings window allows you to customize WhatsApp Dual's behavior to match your workflow. Access it through the menu or by pressing `Ctrl+,`.

### Available Options

- **Language**: Choose between English and Spanish (more can be added via locale files)
- **Default Account**: Select which account to display when the app starts
- **Minimize to Tray**: When enabled, closing the window minimizes to the system tray instead of quitting
- **Start with System**: Automatically launch WhatsApp Dual when you log in
- **Start Minimized**: When combined with auto-start, launches directly to the system tray

## Security

WhatsApp Dual includes comprehensive security features to protect your WhatsApp sessions from unauthorized access. These features are especially important if you share your computer with others or work in environments where you may need to step away from your desk. The security system uses industry-standard encryption (PBKDF2 with 100,000 iterations) to store your PIN securely in the operating system's keychain.

### PIN Protection

The PIN protection feature requires a 4-8 digit code to access the application. Once enabled, you'll need to enter your PIN every time you start the app, when the auto-lock triggers, or when you manually lock the application. Your PIN is never stored in plain text—it's hashed using PBKDF2-SHA512 with a unique salt and stored securely using the operating system's credential storage (libsecret on Linux).

| Feature | Description |
|---------|-------------|
| PIN Length | 4-8 digits |
| Encryption | PBKDF2-SHA512, 100,000 iterations |
| Storage | OS keychain (libsecret) |
| Setup | Settings → Security → Set up PIN |

### Auto-Lock

The auto-lock feature automatically locks the application after a period of inactivity or when your system enters specific states. This ensures your WhatsApp sessions remain protected even if you forget to lock the app manually.

| Trigger | Description | Default |
|---------|-------------|---------|
| Inactivity timeout | Lock after 1-30 minutes without activity | 5 minutes |
| System suspend | Lock when computer goes to sleep | Enabled |
| Screen lock | Lock when you lock your screen | Enabled |

### Quick Lock Methods

When you need to step away quickly, WhatsApp Dual provides multiple ways to lock the application instantly:

- **Keyboard shortcut**: Press `Ctrl+L` to lock immediately
- **Menu**: Settings → Lock now
- **Settings panel**: Security → Lock button

### Failed Attempts Protection

To prevent unauthorized access through brute force attacks, WhatsApp Dual implements progressive delays and lockouts after failed PIN attempts. The system becomes increasingly restrictive with each failed attempt, making it practically impossible to guess the PIN.

| Failed Attempts | Consequence |
|-----------------|-------------|
| 1-3 | No delay |
| 4-5 | 5 second delay |
| 6-7 | 30 second delay |
| 8-9 | 5 minute delay |
| 10+ | 30 minute lockout |

### Paranoia Mode (Session Deletion)

For maximum security in high-risk environments, you can enable automatic session deletion after reaching the maximum failed attempts. When this option is enabled, all WhatsApp sessions will be permanently and securely deleted if someone fails to enter the correct PIN too many times. The deletion uses a secure 3-pass overwrite to ensure data cannot be recovered.

**Warning**: Enabling this feature means you will need to scan QR codes again to reconnect your WhatsApp accounts if the limit is reached. Use this feature only if you prioritize security over convenience.

### Forgot PIN

If you forget your PIN, the only option is to reset the application, which deletes all stored sessions. This is by design—there is no "backdoor" or recovery mechanism, ensuring that your sessions remain protected even if someone gains access to your computer. After reset, you'll need to scan the QR codes again to reconnect your WhatsApp accounts.

## System Requirements

WhatsApp Dual is designed to run efficiently on most Linux systems. Below are the minimum and recommended specifications.

### Minimum Requirements

- **OS**: Ubuntu 20.04 LTS, Debian 11, or equivalent
- **RAM**: 2 GB available
- **Storage**: 200 MB for installation
- **Network**: Internet connection for WhatsApp Web

### Recommended

- **RAM**: 4 GB or more
- **Display**: 1280x720 or higher resolution

## Troubleshooting

This section covers common issues and their solutions. If you encounter a problem not listed here, please open an issue on GitHub.

### Login Issues

If you're having trouble scanning the QR code or staying logged in:

1. **Check your internet connection**: WhatsApp Web requires a stable connection
2. **Clear account data**: In Settings, you can clear data for a specific account and re-scan the QR code
3. **Update the app**: Ensure you're running the latest version

### Performance Issues

If the application feels slow:

1. **Close unused tabs** in the browser views
2. **Restart the application** to clear memory
3. **Check system resources** using your system monitor

### Notification Issues

If notifications aren't appearing:

1. **Check system notification settings**: Ensure notifications are enabled for WhatsApp Dual
2. **Grant notification permissions**: Some desktop environments require explicit permission

## Development

For developers interested in contributing or understanding the codebase, WhatsApp Dual follows a clean architecture with well-documented code.

### Project Structure

```
whatsapp-dual/
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.js         # Application entry point
│   │   ├── menu.js         # Application menu
│   │   ├── tray.js         # System tray integration
│   │   └── updater.js      # Auto-update functionality
│   ├── renderer/           # User interface
│   │   ├── index.html      # Main window
│   │   ├── settings.html   # Settings modal
│   │   ├── styles/         # CSS stylesheets
│   │   └── js/             # Renderer scripts
│   └── shared/             # Shared modules
│       ├── constants.js    # Application constants
│       └── i18n.js         # Internationalization
├── locales/                # Translation files
├── assets/                 # Icons and images
├── build/                  # Build configuration
└── .github/workflows/      # CI/CD automation
```

### Running in Development

Development mode enables hot-reloading and provides access to developer tools for debugging.

```bash
# Install dependencies
npm install

# Start in development mode
npm start
```

## Contributing

Contributions are welcome and appreciated! Whether you're fixing bugs, adding features, improving documentation, or translating to a new language, your help makes WhatsApp Dual better for everyone.

Please read our [Contributing Guide](CONTRIBUTING.md) for details on our development process, code style, and how to submit pull requests.

### Adding a New Language

Expanding language support is one of the easiest ways to contribute:

1. Copy `locales/en.json` to `locales/xx.json` (where `xx` is your language code)
2. Translate all string values in the new file
3. Submit a Pull Request with your translation

## Technologies

WhatsApp Dual is built with modern, well-maintained technologies that provide reliability and performance.

- **[Electron](https://www.electronjs.org/)**: Cross-platform desktop application framework
- **[electron-store](https://github.com/sindresorhus/electron-store)**: Simple data persistence for settings
- **[electron-builder](https://www.electron.build/)**: Complete solution for packaging and distribution
- **[electron-updater](https://www.electron.build/auto-update)**: Automatic update functionality

## License

WhatsApp Dual is open source software licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.

## Legal Disclaimer

This project is not affiliated with, associated with, or endorsed by WhatsApp Inc. or Meta Platforms, Inc. WhatsApp and WhatsApp Business are registered trademarks of WhatsApp Inc. This application uses WhatsApp Web, which is a service provided by WhatsApp Inc. Users must comply with WhatsApp's Terms of Service when using this application.

---

Made with care by [686f6c61](https://github.com/686f6c61)
