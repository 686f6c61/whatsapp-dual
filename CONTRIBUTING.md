# Contributing to WhatsApp Dual

Thank you for your interest in contributing to WhatsApp Dual! This document provides comprehensive guidelines for contributing to this project. We welcome contributions of all kinds, from bug reports and documentation improvements to new features and translations.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style Guidelines](#code-style-guidelines)
- [Making Changes](#making-changes)
- [Submitting Contributions](#submitting-contributions)
- [Adding Translations](#adding-translations)
- [Reporting Issues](#reporting-issues)

## Getting Started

Before contributing, please take a moment to review this guide. Following these guidelines helps maintain code quality and ensures a smooth review process for everyone involved.

### Prerequisites

To contribute to WhatsApp Dual, you'll need:

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Git** for version control
- A **Linux** system for testing (Ubuntu 20.04+ recommended)

## Development Setup

Setting up your development environment is straightforward. Follow these steps to get started:

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/whatsapp-dual.git
cd whatsapp-dual

# 3. Add the upstream remote
git remote add upstream https://github.com/686f6c61/whatsapp-dual.git

# 4. Install dependencies
npm install

# 5. Start the development server
npm start
```

### Development Commands

The following npm scripts are available for development:

| Command | Description |
|---------|-------------|
| `npm start` | Start the app in development mode |
| `npm run build:linux` | Build packages for Linux (.deb, .AppImage, .snap) |
| `npm run build:deb` | Build only the .deb package |

## Project Structure

Understanding the project structure will help you navigate the codebase efficiently:

```
whatsapp-dual/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── main.js             # Application entry point, window management
│   │   ├── menu.js             # Application menu creation
│   │   ├── tray.js             # System tray integration
│   │   └── updater.js          # Auto-update functionality
│   │
│   ├── renderer/               # User interface (renderer process)
│   │   ├── index.html          # Main window HTML
│   │   ├── settings.html       # Settings modal HTML
│   │   ├── js/
│   │   │   ├── renderer.js     # Main window logic
│   │   │   ├── settings.js     # Settings window logic
│   │   │   ├── i18n.js         # Renderer i18n manager
│   │   │   └── theme.js        # Theme manager
│   │   └── styles/
│   │       ├── main.css        # Main stylesheet
│   │       ├── settings.css    # Settings styles
│   │       └── themes/         # Theme CSS variables
│   │
│   └── shared/                 # Shared between main and renderer
│       ├── constants.js        # Application constants
│       └── i18n.js             # Main process i18n
│
├── locales/                    # Translation files
│   ├── en.json                 # English translations
│   └── es.json                 # Spanish translations
│
├── assets/
│   ├── icons/                  # Application icons
│   └── tray/                   # Tray icons
│
├── build/
│   └── electron-builder.yml    # Build configuration
│
└── .github/
    └── workflows/
        └── release.yml         # CI/CD automation
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `src/main/main.js` | Creates window, manages BrowserViews, handles IPC |
| `src/shared/constants.js` | Defines session partitions, shortcuts, window config |
| `src/renderer/js/renderer.js` | Handles dropdown menu and account switching UI |
| `build/electron-builder.yml` | Configures package building and publishing |

## Code Style Guidelines

Maintaining consistent code style makes the codebase easier to read and maintain. Please follow these guidelines:

### JavaScript

```javascript
// Use 2 spaces for indentation
function example() {
  const value = 'string';
  return value;
}

// Use single quotes for strings
const name = 'WhatsApp Dual';

// Use const/let, never var
const immutable = 'value';
let mutable = 'value';

// Add JSDoc comments for functions
/**
 * Brief description of what the function does.
 *
 * @param {string} param - Description of parameter
 * @returns {boolean} Description of return value
 */
function documentedFunction(param) {
  return true;
}

// Use descriptive variable names
const isUpdateAvailable = true;  // Good
const flag = true;               // Avoid
```

### File Headers

All source files should include a header comment:

```javascript
/**
 * WhatsApp Dual - [File Description]
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.0.3
 *
 * [Detailed description of the file's purpose]
 */
```

### CSS

```css
/* Use section comments for organization */
/* =============================================================================
   Section Name
   Description of what this section contains
   ============================================================================= */

/* Use CSS variables for colors */
.element {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

/* Use 2 spaces for indentation */
.class {
  property: value;
}
```

## Making Changes

When making changes, follow this workflow to ensure quality:

### 1. Create a Branch

Create a branch from the latest `main`:

```bash
# Update your local main
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Write clear, commented code
- Follow the code style guidelines
- Test your changes thoroughly
- Update documentation if needed

### 3. Test Your Changes

```bash
# Start the app and test manually
npm start

# Build and test the packaged version
npm run build:deb
sudo dpkg -i dist/*.deb
```

### 4. Commit Your Changes

Use clear, descriptive commit messages:

```bash
# Format: type: brief description
git commit -m "feat: add notification sound toggle"
git commit -m "fix: correct tray icon on dark theme"
git commit -m "docs: update installation instructions"
git commit -m "refactor: simplify account switching logic"
```

**Commit Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Submitting Contributions

When your changes are ready, submit them for review:

### 1. Push Your Branch

```bash
git push origin feature/your-feature-name
```

### 2. Create a Pull Request

1. Go to the [repository](https://github.com/686f6c61/whatsapp-dual)
2. Click "Pull Requests" → "New Pull Request"
3. Select your branch
4. Fill out the PR template with:
   - Clear description of changes
   - Related issue numbers (if any)
   - Screenshots (for UI changes)
   - Testing performed

### 3. Code Review

- Respond to review feedback promptly
- Make requested changes in new commits
- Be open to suggestions and discussions

## Adding Translations

Adding a new language is one of the easiest ways to contribute:

### 1. Create the Translation File

```bash
# Copy the English translations
cp locales/en.json locales/xx.json
# Replace 'xx' with your language code (e.g., 'fr', 'de', 'pt')
```

### 2. Translate the Strings

Edit `locales/xx.json` and translate all values:

```json
{
  "menu": {
    "personal": "Your translation here",
    "business": "Your translation here",
    "settings": "Your translation here"
  }
}
```

**Guidelines:**
- Keep the JSON structure intact
- Only translate the string values
- Maintain any placeholders or special characters
- Test your translations in the app

### 3. Submit Your Translation

Create a Pull Request with:
- The new locale file
- A brief description of the language added

## Reporting Issues

Found a bug or have a suggestion? Please report it:

### Before Submitting

1. **Search existing issues** to avoid duplicates
2. **Update to the latest version** to see if it's already fixed
3. **Collect relevant information** about your system

### Creating an Issue

Include as much detail as possible:

```markdown
**Description**
A clear description of the issue or suggestion.

**Steps to Reproduce** (for bugs)
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**System Information**
- OS: Ubuntu 22.04
- WhatsApp Dual version: 1.0.3
- Installation method: .deb

**Screenshots**
If applicable, add screenshots.
```

## Questions?

If you have questions about contributing:

1. Check existing [issues](https://github.com/686f6c61/whatsapp-dual/issues) for similar questions
2. Open a new issue with the `question` label
3. Be patient and respectful in discussions

---

Thank you for contributing to WhatsApp Dual! Your efforts help make this project better for everyone.
