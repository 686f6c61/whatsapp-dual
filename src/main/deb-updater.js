/**
 * WhatsApp Dual - Debian Package Updater
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 *
 * Assisted update path for .deb installations, where electron-updater
 * cannot self-replace the app (Linux package management requires root).
 *
 * Flow:
 *   1. Fetch the release manifest (latest-linux.yml) from GitHub.
 *   2. Compare versions.
 *   3. If newer, download the .deb, verify its SHA512, and install it via
 *      `pkexec apt-get install` (graphical password prompt), then relaunch.
 *
 * Pure helpers are exported for unit testing; the I/O pieces take injected
 * dependencies so the flow can be exercised without touching the network,
 * the filesystem, or privileged processes.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

/**
 * Parse the electron-builder latest-linux.yml manifest.
 *
 * @param {string} text - Raw YAML text
 * @returns {{version: string, files: Array<{url: string, sha512: string, size: number}>}}
 */
function parseLatestManifest(text) {
  const lines = text.split(/\r?\n/);
  let version = '';
  const files = [];
  let current = null;
  let inFiles = false;

  for (const line of lines) {
    const versionMatch = line.match(/^version:\s*(.+?)\s*$/);
    if (versionMatch) {
      version = versionMatch[1];
      continue;
    }

    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }

    if (inFiles) {
      const urlMatch = line.match(/^\s*-\s*url:\s*(.+?)\s*$/);
      if (urlMatch) {
        current = { url: urlMatch[1], sha512: '', size: 0 };
        files.push(current);
        continue;
      }

      // A non-indented, non-list key ends the files section.
      if (/^\S/.test(line)) {
        inFiles = false;
        current = null;
        continue;
      }

      if (current) {
        const shaMatch = line.match(/^\s*sha512:\s*(.+?)\s*$/);
        if (shaMatch) {
          current.sha512 = shaMatch[1];
          continue;
        }
        const sizeMatch = line.match(/^\s*size:\s*(\d+)\s*$/);
        if (sizeMatch) {
          current.size = Number(sizeMatch[1]);
        }
      }
    }
  }

  return { version, files };
}

/**
 * Pick the .deb asset from a list of manifest files.
 *
 * @param {Array<{url: string}>} files - Manifest file entries
 * @returns {{url: string, sha512: string, size: number}|null} The .deb entry or null
 */
function pickDebAsset(files) {
  return files.find(f => f.url.endsWith('.deb')) || null;
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

/**
 * Compare two dotted versions (optionally v-prefixed).
 *
 * @param {string} candidate - Candidate version
 * @param {string} current - Current version
 * @returns {boolean} True if candidate is strictly newer than current
 */
function isNewerVersion(candidate, current) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// URLs and checksums
// ---------------------------------------------------------------------------

/**
 * Build the GitHub "latest release" download URL for a given filename.
 *
 * @param {string} repo - "owner/name"
 * @param {string} filename - Asset filename
 * @returns {string} Download URL
 */
function buildDebDownloadUrl(repo, filename) {
  return `https://github.com/${repo}/releases/latest/download/${filename}`;
}

/**
 * Build the GitHub "latest release" manifest URL.
 *
 * @param {string} repo - "owner/name"
 * @returns {string} latest-linux.yml URL
 */
function buildManifestUrl(repo) {
  return `https://github.com/${repo}/releases/latest/download/latest-linux.yml`;
}

/**
 * Compute the base64-encoded SHA512 of a buffer.
 *
 * @param {Buffer} buffer - Data
 * @returns {string} Base64 SHA512
 */
function sha512Base64(buffer) {
  return crypto.createHash('sha512').update(buffer).digest('base64');
}

/**
 * Verify a buffer against an expected base64 SHA512 digest.
 *
 * @param {Buffer} buffer - Data
 * @param {string} expectedBase64 - Expected base64 SHA512
 * @returns {boolean} True if the digest matches
 */
function verifyChecksum(buffer, expectedBase64) {
  const actual = sha512Base64(buffer);
  const a = Buffer.from(actual);
  const b = Buffer.from(String(expectedBase64));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Update check
// ---------------------------------------------------------------------------

/**
 * Check GitHub for a newer .deb than the current version.
 *
 * @param {object} opts
 * @param {string} opts.currentVersion - The running app version
 * @param {Function} opts.fetchManifest - Async () => manifest text
 * @returns {Promise<{available: boolean, version: string, deb: object|null}>}
 */
async function checkForNewerDeb({ currentVersion, fetchManifest }) {
  const text = await fetchManifest();
  const manifest = parseLatestManifest(text);
  const deb = pickDebAsset(manifest.files);
  return {
    available: isNewerVersion(manifest.version, currentVersion),
    version: manifest.version,
    deb,
  };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Download a URL to a Buffer, following redirects (uses global fetch).
 *
 * @param {string} url - URL to download
 * @param {Function} [fetchImpl] - fetch implementation (defaults to global fetch)
 * @returns {Promise<Buffer>} Downloaded bytes
 */
async function downloadToBuffer(url, fetchImpl = fetch, { timeoutMs = 120000 } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Manifest publishes the expected size; reject anything that deviates
  // before the checksum stage to bound memory exposure.
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > 0 && buffer.length !== contentLength) {
    throw new Error(`Download size mismatch: expected ${contentLength}, got ${buffer.length}`);
  }
  if (buffer.length > 500 * 1024 * 1024) {
    throw new Error(`Download too large: ${buffer.length} bytes`);
  }
  return buffer;
}

/**
 * Fetch the release manifest text (uses global fetch).
 *
 * @param {string} url - Manifest URL
 * @param {Function} [fetchImpl] - fetch implementation
 * @returns {Promise<string>} Manifest text
 */
async function fetchManifestText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Manifest fetch failed with status ${res.status}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Locate pkexec on the system (used for the privileged install prompt).
 *
 * @param {Function} [existsSync] - fs.existsSync implementation
 * @returns {string|null} Path to pkexec or null
 */
function findPkexec(existsSync = fs.existsSync) {
  for (const candidate of ['/usr/bin/pkexec', '/bin/pkexec']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Build the install invocation for a downloaded .deb.
 *
 * @param {string} debPath - Absolute path to the .deb
 * @param {object} opts
 * @param {string|null} opts.pkexecPath - Path to pkexec, or null for fallback
 * @returns {{mode: 'pkexec', command: string, args: string[]}|{mode: 'open', target: string}}
 */
function buildInstallInvocation(debPath, { pkexecPath }) {
  if (pkexecPath) {
    return {
      mode: 'pkexec',
      command: pkexecPath,
      // apt-get resolves dependencies and upgrades in place
      args: ['apt-get', 'install', '-y', debPath],
    };
  }
  return { mode: 'open', target: debPath };
}

/**
 * Install a downloaded .deb, prompting for privileges via pkexec.
 *
 * Falls back to opening the package with the system installer when pkexec
 * is unavailable.
 *
 * @param {string} debPath - Absolute path to the .deb
 * @param {object} deps
 * @param {string|null} deps.pkexecPath - Path to pkexec (or null)
 * @param {Function} [deps.spawn] - child_process.spawn
 * @param {Function} [deps.openPath] - shell.openPath (fallback)
 * @param {Function} [deps.onDone] - Called with (success: boolean|null)
 * @returns {void}
 */
function installDeb(debPath, { pkexecPath, spawn, openPath, onDone = () => {} }) {
  const invocation = buildInstallInvocation(debPath, { pkexecPath });

  if (invocation.mode === 'open') {
    if (openPath) openPath(debPath);
    onDone(null);
    return;
  }

  const child = spawn(invocation.command, invocation.args, { stdio: 'ignore' });
  child.on('error', () => {
    if (openPath) openPath(debPath);
    onDone(null);
  });
  child.on('exit', (code) => {
    onDone(code === 0);
  });
}

/**
 * Default temp path for a downloaded .deb.
 *
 * The filename comes from the remote manifest, so only a plain
 * `[A-Za-z0-9._-]+.deb` name is accepted to prevent path traversal
 * out of the temp directory if the manifest were tampered with.
 *
 * @param {string} tmpDir - Temp directory
 * @param {string} filename - Asset filename
 * @returns {string} Absolute path
 */
function debTempPath(tmpDir, filename) {
  if (!/^[A-Za-z0-9._-]+\.deb$/.test(filename)) {
    throw new Error(`Invalid .deb filename in manifest: ${filename}`);
  }
  return path.join(tmpDir, path.basename(filename));
}

module.exports = {
  parseLatestManifest,
  pickDebAsset,
  isNewerVersion,
  buildDebDownloadUrl,
  buildManifestUrl,
  sha512Base64,
  verifyChecksum,
  checkForNewerDeb,
  downloadToBuffer,
  fetchManifestText,
  findPkexec,
  buildInstallInvocation,
  installDeb,
  debTempPath,
};
