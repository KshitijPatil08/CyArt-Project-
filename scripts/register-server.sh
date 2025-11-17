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
OS_VERSION=$(lsb_release -d | cut -f2)

echo "Server Information:"
echo "  Hostname: $HOSTNAME"
echo "  IP Address: $IP_ADDRESS"
echo "  OS: $OS_VERSION"
echo ""

# Prompt for Supabase credentials
read -p "Enter Supabase URL (https://xxx.supabase.co): " SUPABASE_URL
read -sp "Enter Supabase Service Role Key: " SUPABASE_KEY
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
    echo "Agents will connect to: http://${IP_ADDRESS}:3000"
    
    # Save device ID for status updates
    mkdir -p /tmp/cyart
    echo "$DEVICE_ID" > /tmp/cyart/server_device_id.txt
    echo "Device ID saved to /tmp/cyart/server_device_id.txt"
  else
    echo "✓ Request successful but could not extract device ID"
    echo "Full response: $RESPONSE_BODY"
  fi
else
  echo "✗ Registration failed with HTTP code: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  echo ""
  echo "Common issues:"
  echo "  - Check if Supabase URL is correct"
  echo "  - Verify Service Role Key (not Anon key)"
  echo "  - Ensure 'devices' table exists in Supabase"
  echo "  - Check RLS policies on devices table"
  exit 1
fi

echo ""
echo "Next steps:"
echo "1. Start the Next.js server: cd ~/CyArt-Project- && npm run dev"
echo "2. Deploy agents to client devices"
echo "3. Agents will auto-discover this server at ${IP_ADDRESS}"
echo ""