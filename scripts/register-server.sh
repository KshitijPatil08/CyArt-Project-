#!/bin/bash
# Register Ubuntu Server in Database
# This makes the server appear in the network topology

set -e

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
read -p "Enter Supabase Service Role Key: " SUPABASE_KEY

echo ""
echo "Registering server in database..."

# Register the server
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/devices" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d @- <<EOF
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

if [ $? -eq 0 ]; then
  DEVICE_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  
  if [ -n "$DEVICE_ID" ]; then
    echo "✓ Server registered successfully!"
    echo "  Device ID: $DEVICE_ID"
    echo ""
    echo "Server will now appear in the network topology as the central hub."
    echo "Agents will connect to: http://${IP_ADDRESS}:3000"
    
    # Save device ID for status updates
    echo "$DEVICE_ID" > /tmp/server_device_id.txt
  else
    echo "✗ Registration failed: Could not extract device ID"
    echo "Response: $RESPONSE"
    exit 1
  fi
else
  echo "✗ Registration failed"
  exit 1
fi

echo ""
echo "Next steps:"
echo "1. Start the Next.js server on this machine"
echo "2. Deploy agents to client devices"
echo "3. Agents will auto-discover this server at ${IP_ADDRESS}"
echo ""
