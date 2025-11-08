#!/bin/bash

# === Configuration ===
VERCEL_URL="https://v0-project1-r9.vercel.app"   # 🔹 replace with your actual deployed Vercel domain
API_ENDPOINT="$VERCEL_URL/api/devices/usb"

# Monitor USB events (Linux systems using udevadm)
udevadm monitor --udev --subsystem-match=usb | while read -r line; do
  # Detect plug or unplug events
  if echo "$line" | grep -q "add"; then
    EVENT_TYPE="usb_insert"
  elif echo "$line" | grep -q "remove"; then
    EVENT_TYPE="usb_remove"
  else
    continue
  fi

  # Log locally
  echo "[INFO] Detected USB event: $EVENT_TYPE"

  # Send event to Vercel API
  curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"$EVENT_TYPE\",\"timestamp\":\"$(date -Iseconds)\"}" \
    > /dev/null

done