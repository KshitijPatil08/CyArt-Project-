#!/bin/bash
# Server Heartbeat - Keep server marked as online
# Run this as a systemd service or cron job

DEVICE_ID_FILE="/tmp/server_device_id.txt"
CONFIG_FILE="/etc/cyart/server.conf"

# Load Supabase config
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
else
  echo "Error: Config file not found at $CONFIG_FILE"
  exit 1
fi

# Load device ID
if [ -f "$DEVICE_ID_FILE" ]; then
  DEVICE_ID=$(cat "$DEVICE_ID_FILE")
else
  echo "Error: Device ID file not found. Run register-server.sh first."
  exit 1
fi

# Update server status
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/devices?id=eq.${DEVICE_ID}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"status\": \"online\",
    \"last_seen\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
  }" > /dev/null

if [ $? -eq 0 ]; then
  echo "[$(date)] Server heartbeat sent successfully"
else
  echo "[$(date)] Failed to send heartbeat"
fi
