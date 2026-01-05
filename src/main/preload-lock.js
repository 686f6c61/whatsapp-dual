/**
 * WhatsApp Dual - Lock Screen Preload Script
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.1.0
 *
 * This preload script provides secure IPC communication between
 * the lock screen renderer process and the main process.
 * It exposes only the necessary security APIs via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// =============================================================================
// Expose Security API to Renderer
// =============================================================================

contextBridge.exposeInMainWorld('electronAPI', {
  security: {
    // PIN verification
    verifyPIN: (pin) => ipcRenderer.invoke('security:verifyPIN', pin),

    // PIN setup
    setPIN: (pin) => ipcRenderer.invoke('security:setPIN', pin),
    isPINSet: () => ipcRenderer.invoke('security:isPINSet'),

    // Lock/unlock
    unlock: (pin) => ipcRenderer.invoke('security:unlock', pin),
    lock: () => ipcRenderer.invoke('security:lock'),

    // Reset app
    resetApp: () => ipcRenderer.invoke('security:resetApp'),

    // PIN setup completion (notify main process)
    pinSetupComplete: () => ipcRenderer.send('security:pinSetupComplete'),

    // Skip PIN setup
    skipPINSetup: () => ipcRenderer.send('security:skipPINSetup'),

    // Get settings
    getSettings: () => ipcRenderer.invoke('security:getSettings')
  }
});
