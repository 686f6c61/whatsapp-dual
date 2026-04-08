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
