/**
 * WhatsApp Dual - Session Protection
 *
 * Handles file permissions, integrity hashes,
 * secure deletion and full app reset.
 *
 * @author 686f6c61
 * @license MIT
 */

const { app, dialog } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../../shared/logger');

// ---------------------------------------------------------------------------
// Dependencies injected from outside
// ---------------------------------------------------------------------------
const deps = {
  store: null,
  resetFailedAttempts: null,
};

/**
 * Inject dependencies from the facade.
 *
 * @param {object} injected
 * @param {object}   injected.store
 * @param {Function} injected.resetFailedAttempts
 */
function inject(injected) {
  deps.store = injected.store;
  deps.resetFailedAttempts = injected.resetFailedAttempts;
}

// ---------------------------------------------------------------------------
// File permissions
// ---------------------------------------------------------------------------

/**
 * Secure session files with restrictive permissions.
 */
function secureSessionFiles() {
  try {
    const partitionsPath = path.join(app.getPath('userData'), 'Partitions');

    if (!fs.existsSync(partitionsPath)) {
      return;
    }

    setPermissionsRecursive(partitionsPath);
    logger.debug('Session files secured with restrictive permissions');
  } catch (error) {
    console.error('Error securing session files:', error);
  }
}

/**
 * Set restrictive permissions recursively.
 *
 * @param {string} dirPath - Directory path
 */
function setPermissionsRecursive(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.lstatSync(fullPath);

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        fs.chmodSync(fullPath, 0o700); // rwx------
        setPermissionsRecursive(fullPath);
      } else {
        fs.chmodSync(fullPath, 0o600); // rw-------
      }
    }
  } catch (error) {
    // Ignore permission errors (EPERM/EACCES) — log others
    if (error.code !== 'EPERM' && error.code !== 'EACCES') {
      console.error(`Error setting permissions on ${dirPath}:`, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Integrity hashes
// ---------------------------------------------------------------------------

/**
 * Calculate hash of session files for integrity verification.
 *
 * @param {string} partition - Partition name
 * @returns {string|null} Hash or null if error
 */
function calculateSessionHash(partition) {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'Partitions', partition);

    if (!fs.existsSync(sessionPath)) {
      return null;
    }

    const hash = crypto.createHash('sha256');
    const files = getFilesRecursive(sessionPath);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file);
        hash.update(content);
      } catch (e) {
        // Skip files that can't be read (locked by Chromium, etc.)
        console.error(`Skipping unreadable file ${file}:`, e.message);
      }
    }

    return hash.digest('hex');
  } catch (error) {
    console.error('Error calculating session hash:', error);
    return null;
  }
}

/**
 * Get all files recursively from a directory.
 *
 * @param {string} dirPath - Directory path
 * @returns {string[]} Array of file paths
 */
function getFilesRecursive(dirPath) {
  const files = [];

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.lstatSync(fullPath);

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        files.push(...getFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory may not be readable; log and return partial results
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return files;
}

/**
 * Save session hashes for integrity verification.
 */
function saveSessionHashes() {
  try {
    const hashes = {
      personal: calculateSessionHash('persist:whatsapp-personal'),
      business: calculateSessionHash('persist:whatsapp-business'),
      timestamp: Date.now()
    };

    deps.store.set('security.sessionHashes', hashes);
  } catch (error) {
    console.error('Error saving session hashes:', error);
  }
}

/**
 * Verify session integrity.
 *
 * @returns {object} Integrity status for each account
 */
function verifySessionIntegrity() {
  const saved = deps.store.get('security.sessionHashes');

  if (!saved) {
    return { verified: true, firstRun: true };
  }

  const currentPersonal = calculateSessionHash('persist:whatsapp-personal');
  const currentBusiness = calculateSessionHash('persist:whatsapp-business');

  const personalOk = !saved.personal || currentPersonal === saved.personal;
  const businessOk = !saved.business || currentBusiness === saved.business;

  return {
    verified: personalOk && businessOk,
    personal: personalOk,
    business: businessOk,
    lastCheck: saved.timestamp
  };
}

/**
 * Show integrity warning dialog.
 */
function showIntegrityWarning() {
  dialog.showMessageBox({
    type: 'warning',
    title: 'Security Alert',
    message: 'Session files may have been modified externally.',
    detail: 'Your WhatsApp sessions may have been accessed or tampered with while the app was closed. Consider logging out and scanning the QR code again for security.',
    buttons: ['OK', 'Logout All Sessions'],
    defaultId: 0
  }).then(result => {
    if (result.response === 1) {
      secureDeleteAllSessions();
      app.relaunch();
      app.exit(0);
    }
  });
}

// ---------------------------------------------------------------------------
// Secure delete
// ---------------------------------------------------------------------------

/**
 * Securely delete a file by overwriting with random data.
 *
 * Known limitation: on SSDs (wear leveling) and journaling/copy-on-write
 * filesystems the overwritten blocks may persist physically, so this is
 * best-effort hygiene, not forensic-grade erasure (see SECURITY.md).
 *
 * @param {string} filePath - Path to file
 */
function secureDeleteFile(filePath) {
  let fd;
  try {
    // Open file directly to avoid TOCTOU race (CWE-367)
    fd = fs.openSync(filePath, 'r+');
    const stat = fs.fstatSync(fd);
    const size = stat.size;

    // 3 passes of random data
    for (let pass = 0; pass < 3; pass++) {
      const randomData = crypto.randomBytes(size);
      fs.writeSync(fd, randomData, 0, size, 0);
    }

    fs.closeSync(fd);
    fd = null;
    fs.unlinkSync(filePath);
  } catch (secureDeleteError) {
    if (fd) {
      try { fs.closeSync(fd); } catch (_) { /* already closed */ }
    }
    if (secureDeleteError.code === 'ENOENT') return;
    console.error(`Secure delete failed for ${filePath}:`, secureDeleteError.message);
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error(`Failed to delete file ${filePath}:`, e.message);
    }
  }
}

/**
 * Securely delete a session partition.
 *
 * @param {string} partition - Partition name
 */
function secureDeleteSession(partition) {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'Partitions', partition);

    if (!fs.existsSync(sessionPath)) {
      return;
    }

    const files = getFilesRecursive(sessionPath);

    for (const file of files) {
      secureDeleteFile(file);
    }

    // Remove empty directories
    fs.rmSync(sessionPath, { recursive: true, force: true });

    logger.debug(`Session ${partition} securely deleted`);
  } catch (error) {
    console.error(`Error deleting session ${partition}:`, error);
  }
}

/**
 * Securely delete all sessions.
 */
function secureDeleteAllSessions() {
  secureDeleteSession('persist:whatsapp-personal');
  secureDeleteSession('persist:whatsapp-business');
  deps.store.delete('security.sessionHashes');
}

/**
 * Reset the entire app (delete PIN and sessions).
 */
function resetApp() {
  return new Promise((resolve) => {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Reset App',
      message: 'This will delete all WhatsApp sessions and remove PIN protection.',
      detail: 'You will need to scan QR codes again to log in.',
      buttons: ['Cancel', 'Reset Everything'],
      defaultId: 0,
      cancelId: 0
    }).then(result => {
      if (result.response === 1) {
        // Delete PIN
        deps.store.delete('security.pinData');
        deps.store.set('security.pinEnabled', false);
        deps.resetFailedAttempts();

        // Delete sessions
        secureDeleteAllSessions();

        // Relaunch app
        app.relaunch();
        app.exit(0);

        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  inject,

  // File protection
  secureSessionFiles,
  setPermissionsRecursive,
  calculateSessionHash,
  getFilesRecursive,
  saveSessionHashes,
  verifySessionIntegrity,
  showIntegrityWarning,

  // Secure delete
  secureDeleteFile,
  secureDeleteSession,
  secureDeleteAllSessions,
  resetApp,
};
