#!/bin/bash

# Server Monitor Script
# This script sends a periodic heartbeat to the CyArt API to keep the server status "Online".
# It does NOT send logs or monitor USB events.

# Configuration
API_URL="https://v0-project1-r9.vercel.app" # Change this to your deployed API URL if needed
DEVICE_ID="server"              # The ID of your server device in the database
INTERVAL=30                     # Heartbeat interval in seconds

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Server Monitor for Device ID: $DEVICE_ID${NC}"
echo -e "Target API: $API_URL"
echo -e "Heartbeat Interval: ${INTERVAL}s"

while true; do
    # Construct JSON payload
    PAYLOAD=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "status": "online",
    "security_status": "secure"
}
EOF
)

    # Send heartbeat
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/devices/status" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD")

    if [ "$RESPONSE" -eq 200 ]; then
        echo -e "[$(date +%T)] ${GREEN}Heartbeat sent successfully.${NC}"
    else
        echo -e "[$(date +%T)] ${RED}Failed to send heartbeat. HTTP Code: $RESPONSE${NC}"
    fi

    # Wait for next heartbeat
    sleep $INTERVAL
done
