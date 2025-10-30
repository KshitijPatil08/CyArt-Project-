#!/bin/bash

# Linux Device Tracking Agent
# This script collects USB device events, system logs, and sends them to the API

API_URL="${1:-http://localhost:3000}"
DEVICE_NAME="${2:-$(hostname)}"
OWNER="${3:-$(whoami)}"
LOCATION="${4:-Office}"
DEVICE_ID=""
POLL_INTERVAL=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Initialize device
initialize_device() {
    local os_version=$(uname -r)
    local hostname=$(hostname)
    local ip_address=$(hostname -I | awk '{print $1}')

    local payload=$(cat <<EOF
{
    "device_name": "$DEVICE_NAME",
    "device_type": "linux",
    "owner": "$OWNER",
    "location": "$LOCATION",
    "hostname": "$hostname",
    "ip_address": "$ip_address",
    "os_version": "$os_version",
    "agent_version": "1.0.0"
}
EOF
)

    response=$(curl -s -X POST "$API_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -d "$payload")

    DEVICE_ID=$(echo "$response" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$DEVICE_ID" ]; then
        echo -e "${GREEN}Device registered: $DEVICE_ID${NC}"
    else
        echo -e "${RED}Error registering device${NC}"
    fi
}

# Track USB devices
track_usb_devices() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    local state_file="/tmp/usb_state.txt"
    local current_usbs=$(lsusb | awk '{print $6}')

    # Get previous state
    local previous_state=""
    if [ -f "$state_file" ]; then
        previous_state=$(cat "$state_file")
    fi

    # Check for new USB devices
    while IFS= read -r usb; do
        if ! echo "$previous_state" | grep -q "$usb"; then
            send_usb_event "insert" "$usb" "usb_drive"
        fi
    done <<< "$current_usbs"

    # Check for removed USB devices
    while IFS= read -r usb; do
        if ! echo "$current_usbs" | grep -q "$usb"; then
            send_usb_event "remove" "$usb" "usb_drive"
        fi
    done <<< "$previous_state"

    # Save current state
    echo "$current_usbs" > "$state_file"
}

# Send USB event to API
send_usb_event() {
    local action=$1
    local usb_name=$2
    local device_type=$3

    local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "usb_name": "$usb_name",
    "device_type": "$device_type",
    "action": "$action",
    "serial_number": "$(uuidgen)",
    "data_transferred_mb": 0
}
EOF
)

    curl -s -X POST "$API_URL/api/devices/usb" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null

    echo -e "${GREEN}USB event sent: $action - $usb_name${NC}"
}

# Collect and send logs
send_logs() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    # Get recent auth logs
    local logs=$(tail -20 /var/log/auth.log 2>/dev/null || tail -20 /var/log/secure 2>/dev/null)

    while IFS= read -r log; do
        [ -z "$log" ] && continue

        local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "log_type": "security",
    "source": "syslog",
    "severity": "info",
    "message": "$log",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "raw_data": {}
}
EOF
)

        curl -s -X POST "$API_URL/api/logs" \
            -H "Content-Type: application/json" \
            -d "$payload" > /dev/null
    done <<< "$logs"
}

# Update device status
update_device_status() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "status": "online",
    "security_status": "secure"
}
EOF
)

    curl -s -X POST "$API_URL/api/devices/status" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null
}

# Main loop
echo "Starting Linux Device Tracking Agent..."
initialize_device

while true; do
    track_usb_devices
    send_logs
    update_device_status
    sleep $POLL_INTERVAL
done
