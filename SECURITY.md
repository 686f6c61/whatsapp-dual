# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.3.x   | Yes       |
| < 1.3   | No        |

## Reporting a vulnerability

If you discover a security vulnerability in WhatsApp Dual, please report it responsibly:

1. **Do not open a public issue.** Security vulnerabilities must be reported privately.
2. **Email**: Send a detailed report to [686f6c61@users.noreply.github.com](mailto:686f6c61@users.noreply.github.com)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Affected version(s)
   - Potential impact
   - Suggested fix (if any)

You will receive an acknowledgement within 48 hours. A fix will be prioritised based on severity.

## Scope

The following areas are in scope for security reports:

- **PIN protection**: Hashing, storage, verification, lockout logic
- **Session isolation**: Partition separation, data leakage between accounts
- **IPC handlers**: Input validation, sender verification, privilege escalation
- **File protection**: Session file permissions, secure delete
- **Auto-update**: Update verification, download integrity
- **Electron security**: contextIsolation, sandbox, CSP, preload scripts

## Out of scope

- WhatsApp Web vulnerabilities (report to Meta)
- Denial of service via local access (user already has machine access)
- Social engineering attacks

## Security architecture

WhatsApp Dual implements the following security measures:

- **PIN hashing**: PBKDF2-SHA512 with 100,000 iterations and 32-byte random salt
- **PIN storage**: OS keychain via Electron safeStorage (libsecret on Linux)
- **Session isolation**: Separate Chromium partitions (`persist:whatsapp-personal`, `persist:whatsapp-business`)
- **Sandboxing**: All renderer processes run with `sandbox: true` and `contextIsolation: true`
- **IPC validation**: Mutating IPC handlers verify sender identity against known windows
- **CSP**: Content Security Policy enforced on all HTML pages
- **File permissions**: Session files restricted to owner-only access (0600/0700)

## Known limitations

- **`--no-sandbox` flag**: Required on some Linux configurations where the Chromium sandbox cannot initialise. This disables the OS-level sandbox but Chromium's internal site isolation remains active. See [Electron issue #29981](https://github.com/nicedoc/electron-docs/blob/main/faq.md#electron-is-not-a-browser) for context.
- **PIN fallback without safeStorage**: When the OS keychain is unavailable, PIN data is stored as base64-encoded JSON. This is not encryption -- an attacker with file access could extract the hash. The PIN hash itself is still PBKDF2, so offline brute-force is throttled but feasible for short PINs.
- **PIN numeric only**: PINs are restricted to 4-8 digits. Against a PBKDF2 hash extracted offline, the keyspace (10^4 to 10^8) is exhaustible.
