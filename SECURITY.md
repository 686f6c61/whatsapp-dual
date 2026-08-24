# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.5.x   | Yes       |
| < 1.5   | No        |

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

- **PIN hashing**: PBKDF2-SHA512 with 210,000 iterations (OWASP baseline) and 32-byte random salt; constant-time hash comparison via `crypto.timingSafeEqual`. Records created before v1.5.3 with 100,000 iterations are upgraded transparently on the next successful unlock
- **PIN rate limiting**: Progressive delays after failed attempts (5 s / 30 s / 5 min) are enforced in the main process before verification, not only in the lock-screen UI
- **PIN storage**: OS keychain via Electron safeStorage (libsecret on Linux)
- **Lock screen**: Account switching and view reloads are refused while the app is locked, so tray menu items and keyboard accelerators cannot expose conversations behind the lock window
- **Session isolation**: Separate Chromium partitions (`persist:whatsapp-personal`, `persist:whatsapp-business`)
- **Sandboxing**: All renderer processes run with `sandbox: true` and `contextIsolation: true`
- **IPC validation**: Security-sensitive IPC handlers verify sender identity against known application windows and WhatsApp views
- **CSP**: Content Security Policy enforced on all HTML pages
- **File permissions**: Session files and the electron-store `config.json` (PIN hash, attempt counters, session hashes) restricted to owner-only access (0600/0700)
- **Update hardening**: `.deb` downloads verify the manifest SHA512 and declared size, validate the filename against a strict allowlist (no path traversal), enforce a download timeout and size cap, and write the package with 0600 permissions before installation. Releases also publish `SHA256SUMS.txt` as an integrity channel independent of the update manifest

## Known limitations

- **Sandbox compatibility fallback**: The app enables Chromium sandboxing by default. On Linux configurations where the sandbox cannot initialise, users can still launch manually with `--no-sandbox`, but this reduces renderer isolation.
- **PIN fallback without safeStorage**: When the OS keychain is unavailable, PIN data is stored as base64-encoded JSON. This is not encryption -- an attacker with file access could extract the hash. The PIN hash itself is still PBKDF2, so offline brute-force is throttled but feasible for short PINs.
- **PIN numeric only**: PINs are restricted to 4-8 digits. Against a PBKDF2 hash extracted offline, the keyspace (10^4 to 10^8) is exhaustible.
- **Unsigned Linux artifacts**: Auto-update integrity relies on HTTPS to GitHub Releases plus the SHA512 checksum published in `latest-linux.yml`. Linux artifacts (AppImage/deb/snap) carry no cryptographic code signature, so a compromise of the release channel would not be detected by signature verification. Secure deletion of session files is also best-effort on SSDs and journaling filesystems, where overwritten blocks may persist.
