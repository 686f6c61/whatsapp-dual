/**
 * WhatsApp Dual - Settings Preload Script
 *
 * @author 686f6c61
 * @license MIT
 * @repository https://github.com/686f6c61/whatsapp-dual
 * @version 1.2.1
 *
 * Secure preload script for the Settings window.
 * Uses contextBridge to expose a minimal API surface to the renderer,
 * preventing direct access to Node.js or Electron internals.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings operations
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    onChanged: (callback) => {
      ipcRenderer.on('settings-updated', () => callback());
    }
  },

  // i18n operations
  i18n: {
    getTranslations: () => ipcRenderer.invoke('i18n:getTranslations'),
    getLanguage: () => ipcRenderer.invoke('i18n:getLanguage'),
    getAvailableLanguages: () => ipcRenderer.invoke('i18n:getAvailableLanguages'),
    getTranslationsForLanguage: (lang) => ipcRenderer.invoke('i18n:getTranslationsForLanguage', lang)
  },

  // Security operations
  security: {
    isPINSet: () => ipcRenderer.invoke('security:isPINSet'),
    isPINEnabled: () => ipcRenderer.invoke('security:isPINEnabled'),
    getSettings: () => ipcRenderer.invoke('security:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('security:saveSettings', settings),
    removePIN: (pin) => ipcRenderer.invoke('security:removePIN', pin),
    setupPIN: () => ipcRenderer.send('security:setupPIN'),
    lockNow: () => ipcRenderer.send('security:lockNow'),
    onPINSetupComplete: (callback) => {
      ipcRenderer.on('security:pinSetupDone', () => callback());
    }
  },

  // Window operations
  window: {
    close: () => ipcRenderer.send('close-settings')
  }
});
