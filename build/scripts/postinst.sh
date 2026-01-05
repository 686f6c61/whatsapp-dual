#!/bin/bash
# Post-installation script for WhatsApp Dual
# Fixes chrome-sandbox permissions for Electron

SANDBOX_PATH="/opt/WhatsAppDual/chrome-sandbox"

if [ -f "$SANDBOX_PATH" ]; then
    chown root:root "$SANDBOX_PATH"
    chmod 4755 "$SANDBOX_PATH"
fi

exit 0
