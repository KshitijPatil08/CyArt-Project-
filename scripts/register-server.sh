#!/bin/bash
# Register Ubuntu Server in Database & Install as Service

echo "=========================================="
echo "CyArt Server Registration & Monitor"
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

# Check if we are already running as a service
if [ "$1" == "--monitor" ]; then
    # We are in monitor mode (running as service)
    # Load ID
    if [ -f "/etc/cyart/server_device_id.txt" ]; then
        DEVICE_ID=$(cat "/etc/cyart/server_device_id.txt")
    else
        echo "Error: Device ID not found. Run without --monitor first."
        exit 1
    fi
    
    API_URL="https://v0-project1-r9.vercel.app"
    INTERVAL=30
    
    echo "Starting Heartbeat Loop for ID: $DEVICE_ID"
    while true; do
        PAYLOAD="{\"device_id\": \"$DEVICE_ID\", \"status\": \"online\", \"security_status\": \"secure\"}"
        curl -s -o /dev/null -X POST "$API_URL/api/devices/status" -H "Content-Type: application/json" -d "$PAYLOAD"
        sleep $INTERVAL
    done
    exit 0
fi

# --- Interactive Mode ---

# Prompt for Supabase credentials
read -p "Enter Supabase URL (https://xxx.supabase.co): " SUPABASE_URL
read -p "Enter Supabase Service Role Key: " SUPABASE_KEY
echo ""

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "Error: Supabase URL and Key are required!"
    exit 1
fi

SUPABASE_URL=${SUPABASE_URL%/}

echo "Registering server..."

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

# Register
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/devices" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$JSON_PAYLOAD" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d':' -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*//g')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  DEVICE_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -1)
  
  if [ -n "$DEVICE_ID" ]; then
    echo "✓ Registration successful! Device ID: $DEVICE_ID"
    
    # Save ID to a permanent location for the service
    sudo mkdir -p /etc/cyart
    echo "$DEVICE_ID" | sudo tee /etc/cyart/server_device_id.txt > /dev/null
    echo "ID saved to /etc/cyart/server_device_id.txt"
  else
    echo "Could not extract Device ID."
    exit 1
  fi
else
  echo "Registration failed ($HTTP_CODE)."
  exit 1
fi

echo ""
echo "=========================================="
echo "       Auto-Start Configuration"
echo "=========================================="
echo "Do you want to install this as a system service?"
echo "This will make it run automatically on boot."
read -p "Install Service? (y/n): " INSTALL_SERVICE

if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
    SCRIPT_PATH=$(realpath "$0")
    SERVICE_FILE="/etc/systemd/system/cyart-server.service"
    
    echo "Creating service file at $SERVICE_FILE..."
    
    sudo bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=CyArt Server Monitor
After=network.target

[Service]
Type=simple
ExecStart=$SCRIPT_PATH --monitor
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

    echo "Reloading systemd..."
    sudo systemctl daemon-reload
    echo "Enabling service..."
    sudo systemctl enable cyart-server
    echo "Starting service..."
    sudo systemctl start cyart-server
    
    echo ""
    echo "✓ Service installed and started!"
    echo "Check status with: sudo systemctl status cyart-server"
else
    echo ""
    echo "Skipping service installation."
    echo "You can run the monitor manually with: $0 --monitor"
fi
