/**
 * WhatsApp Dual - WhatsApp View Preload
 *
 * Reports real user activity from the remote WhatsApp page back to the
 * main process so the inactivity timer only resets on genuine interaction.
 */

const { ipcRenderer } = require('electron');

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'focus',
  'visibilitychange',
];

let lastActivitySentAt = 0;
const ACTIVITY_THROTTLE_MS = 15000;
const LAYOUT_FIX_STYLE_ID = 'whatsapp-dual-layout-fix';
const LAYOUT_FIX_CSS = `
  html,
  body,
  #app {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    overflow: hidden !important;
    background: #111b21 !important;
  }

  #app > div,
  .app-wrapper-web {
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    max-height: none !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    margin: 0 !important;
  }
`;

function injectLayoutFix() {
  if (document.getElementById(LAYOUT_FIX_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = LAYOUT_FIX_STYLE_ID;
  style.textContent = LAYOUT_FIX_CSS;

  (document.head || document.documentElement).appendChild(style);
}

function notifyActivity() {
  const now = Date.now();
  if (now - lastActivitySentAt < ACTIVITY_THROTTLE_MS) {
    return;
  }

  lastActivitySentAt = now;
  ipcRenderer.send('security:activity');
}

for (const eventName of ACTIVITY_EVENTS) {
  window.addEventListener(eventName, notifyActivity, { capture: true, passive: true });
}

window.addEventListener('load', notifyActivity, { once: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectLayoutFix, { once: true });
} else {
  injectLayoutFix();
}
