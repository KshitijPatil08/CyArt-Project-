#!/bin/bash
# Register Ubuntu Server in Database
# This makes the server appear in the network topology

echo "=========================================="
echo "CyArt Server Registration"
echo "=========================================="
echo ""

# Get server information
HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')
OS_VERSION=$(lsb_release -d 2>/dev/null | cut -f2 || echo "Linux")

echo "Server Information:"
echo "  Hostname: $HOSTNAME"
echo "  IP Address: $IP_ADDRESS"
echo "  OS: $OS_VERSION"
echo ""

# Prompt for Supabase credentials
read -p "Enter Supabase URL (https://xxx.supabase.co): " SUPABASE_URL
read -p "Enter Supabase Service Role Key: " SUPABASE_KEY
echo ""
echo ""

# Validate inputs
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "Error: Supabase URL and Key are required!"
    exit 1
fi

# Remove trailing slash from URL if present
SUPABASE_URL=${SUPABASE_URL%/}

echo "Registering server in database..."
echo ""

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "device_name": "Ubuntu Server - ${HOSTNAME}",
  "device_type": "linux",
  "owner": "IT Department",
  "location": "Server Room",
  "hostname": "${HOSTNAME}",
  "ip_address": "${IP_ADDRESS}",
  "os_version": "${OS_VERSION}",
  "agent_version": "3.0.0-server",
  "status": "online",
  "security_status": "secure",
  "is_server": true
}
EOF
)

# Debug: Show what we're sending
echo "Debug Information:"
echo "URL: ${SUPABASE_URL}/rest/v1/devices"
echo "Payload: $JSON_PAYLOAD"
echo ""

# Make the request with better error handling
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/devices" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$JSON_PAYLOAD" 2>&1)

# Extract HTTP status code
HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d':' -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*//g')

echo "HTTP Status Code: $HTTP_CODE"
echo "Response Body: $RESPONSE_BODY"
echo ""

# Check if successful (2xx status codes)
if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  # Try to extract device ID
  DEVICE_ID=$(echo "$RESPONSE_BODY" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*' | sed 's/"id"[[:space:]]*:[[:space:]]*"//g' | head -1)
  
  if [ -z "$DEVICE_ID" ]; then
    # Try alternative JSON parsing
    DEVICE_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -1)
  fi
  
  if [ -n "$DEVICE_ID" ]; then
    echo "✓ Server registered successfully!"
    echo "  Device ID: $DEVICE_ID"
    echo ""
    echo "Server will now appear in the network topology as the central hub."
    
    # Save device ID for status updates
    mkdir -p /tmp/cyart
    echo "$DEVICE_ID" > /tmp/cyart/server_device_id.txt
    echo "Device ID saved to /tmp/cyart/server_device_id.txt"
  else
    echo "✓ Request successful but could not extract device ID"
    echo "Full response: $RESPONSE_BODY"
    exit 1
  fi
else
  echo "✗ Registration failed with HTTP code: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi

echo ""
echo "=========================================="
echo "Starting Server Heartbeat Monitor"
echo "=========================================="

# Configuration for Monitor
API_URL="https://v0-project1-r9.vercel.app" # Default API URL
INTERVAL=30

echo "Target API: $API_URL"
echo "Device ID: $DEVICE_ID"
echo "Press Ctrl+C to stop."

while true; do
    # Construct Heartbeat Payload
    PAYLOAD=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "status": "online",
    "security_status": "secure"
}
EOF
)

    # Send heartbeat
    # Using the Next.js API for heartbeats as it handles last_seen logic best
    MONITOR_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/devices/status" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD")

    if [ "$MONITOR_RESPONSE" -eq 200 ]; then
        echo -e "[$(date +%T)] \033[0;32mHeartbeat sent successfully.\033[0m"
    else
        echo -e "[$(date +%T)] \033[0;31mFailed to send heartbeat. HTTP Code: $MONITOR_RESPONSE\033[0m"
    fi

    # Wait for next heartbeat
    sleep $INTERVAL
done
