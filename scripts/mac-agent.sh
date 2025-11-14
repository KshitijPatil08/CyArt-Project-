#!/bin/bash

# Enhanced macOS Device Tracking Agent
# Runs in background, registers once, collects overall system logs

API_URL="${1:-https://v0-project1-r9.vercel.app}"
DEVICE_NAME="${2:-$(hostname)}"
OWNER="${3:-$(whoami)}"
LOCATION="${4:-Office}"
DEVICE_ID=""
POLL_INTERVAL=30
REGISTRATION_FILE="$HOME/.cyart-agent/device_id.txt"
LOG_FILE="$HOME/.cyart-agent/agent.log"

# Ensure directory exists
mkdir -p "$HOME/.cyart-agent"

# Logging function
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" >> "$LOG_FILE"
    echo "[$timestamp] $message"
}

# Initialize device (register once)
initialize_device() {
    # Check if already registered
    if [ -f "$REGISTRATION_FILE" ]; then
        DEVICE_ID=$(cat "$REGISTRATION_FILE")
        if [ -n "$DEVICE_ID" ]; then
            log_message "Using existing device ID: $DEVICE_ID"
            return
        fi
    fi

    local os_version=$(sw_vers -productVersion)
    local hostname=$(hostname)
    local ip_address=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "127.0.0.1")

    local payload=$(cat <<EOF
{
    "device_name": "$DEVICE_NAME",
    "device_type": "mac",
    "owner": "$OWNER",
    "location": "$LOCATION",
    "hostname": "$hostname",
    "ip_address": "$ip_address",
    "os_version": "macOS $os_version",
    "agent_version": "2.0.0"
}
EOF
)

    response=$(curl -s -X POST "$API_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -d "$payload")

    DEVICE_ID=$(echo "$response" | grep -o '"device_id":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$DEVICE_ID" ]; then
        echo "$DEVICE_ID" > "$REGISTRATION_FILE"
        log_message "Device registered: $DEVICE_ID"
    else
        log_message "Error registering device: $response"
        exit 1
    fi
}

# Get USB device details
get_usb_details() {
    local device_path="$1"
    local details="{}"
    
    if [ -n "$device_path" ]; then
        # Get USB details using system_profiler on macOS
        local vendor_id=$(system_profiler SPUSBDataType 2>/dev/null | grep -A 10 "$device_path" | grep "Vendor ID" | awk '{print $3}' | head -1)
        local product_id=$(system_profiler SPUSBDataType 2>/dev/null | grep -A 10 "$device_path" | grep "Product ID" | awk '{print $3}' | head -1)
        local serial=$(system_profiler SPUSBDataType 2>/dev/null | grep -A 10 "$device_path" | grep "Serial Number" | awk '{print $3}' | head -1)
        
        if [ -n "$vendor_id" ] || [ -n "$product_id" ]; then
            details=$(cat <<EOF
{
    "vendor_id": "${vendor_id:-}",
    "product_id": "${product_id:-}",
    "serial_number": "${serial:-UNKNOWN}"
}
EOF
)
        fi
    fi
    
    echo "$details"
}

# Track USB devices
track_usb_devices() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    local state_file="/tmp/usb_state.json"
    local current_usbs="{}"
    
    # Get current USB devices using system_profiler
    system_profiler SPUSBDataType 2>/dev/null | grep -E "USB|Product ID|Serial Number" | while IFS= read -r line; do
        if echo "$line" | grep -q "USB"; then
            local device_name=$(echo "$line" | sed 's/.*USB //' | sed 's/:$//')
        elif echo "$line" | grep -q "Serial Number"; then
            local serial=$(echo "$line" | awk '{print $3}')
            if [ -n "$device_name" ] && [ -n "$serial" ]; then
                current_usbs=$(echo "$current_usbs" | jq -r --arg name "$device_name" --arg ser "$serial" '. + {($name): {"serial": $ser}}' 2>/dev/null || echo "$current_usbs")
            fi
        fi
    done

    # Get previous state
    local previous_state="{}"
    if [ -f "$state_file" ]; then
        previous_state=$(cat "$state_file" 2>/dev/null || echo "{}")
    fi

    # Check for new/removed USB devices (simplified without jq dependency)
    if command -v jq >/dev/null 2>&1; then
        echo "$current_usbs" | jq -r 'keys[]' 2>/dev/null | while read -r device_name; do
            if ! echo "$previous_state" | jq -e --arg dev "$device_name" 'has($dev)' >/dev/null 2>&1; then
                local serial=$(echo "$current_usbs" | jq -r --arg dev "$device_name" '.[$dev].serial // "UNKNOWN"')
                send_usb_event "connected" "$device_name" "$serial"
            fi
        done

        echo "$previous_state" | jq -r 'keys[]' 2>/dev/null | while read -r device_name; do
            if ! echo "$current_usbs" | jq -e --arg dev "$device_name" 'has($dev)' >/dev/null 2>&1; then
                send_usb_event "disconnected" "$device_name" "UNKNOWN"
            fi
        done
    else
        log_message "Warning: jq not installed, USB tracking limited"
    fi

    # Save current state
    echo "$current_usbs" > "$state_file"
}

# Send USB event to API
send_usb_event() {
    local action=$1
    local usb_name=$2
    local serial=$3

    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "device_name": "$DEVICE_NAME",
    "hostname": "$(hostname)",
    "log_type": "hardware",
    "hardware_type": "usb",
    "event": "$action",
    "source": "macos-agent",
    "severity": "info",
    "message": "USB device $action: $usb_name",
    "timestamp": "$timestamp",
    "raw_data": {
        "usb_name": "$usb_name",
        "serial_number": "$serial"
    }
}
EOF
)

    curl -s -X POST "$API_URL/api/log" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null

    log_message "USB event sent: $action - $usb_name"
}

# Collect and send system logs
send_system_logs() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    local hostname=$(hostname)
    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    # Get system logs using log command (macOS)
    log show --predicate 'process == "kernel" OR process == "securityd"' --last 5m --style syslog 2>/dev/null | tail -5 | while IFS= read -r log; do
        [ -z "$log" ] && continue
        
        local severity="info"
        if echo "$log" | grep -qi "error\|critical\|fail"; then
            severity="error"
        elif echo "$log" | grep -qi "warn"; then
            severity="warning"
        fi

        local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "device_name": "$DEVICE_NAME",
    "hostname": "$hostname",
    "log_type": "system",
    "source": "macOS system log",
    "severity": "$severity",
    "message": "$(echo "$log" | sed 's/"/\\"/g')",
    "timestamp": "$timestamp",
    "raw_data": {}
}
EOF
)

        curl -s -X POST "$API_URL/api/log" \
            -H "Content-Type: application/json" \
            -d "$payload" > /dev/null
    done
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

# Main execution
log_message "Starting Enhanced macOS Device Tracking Agent..."
initialize_device

if [ -z "$DEVICE_ID" ]; then
    log_message "Failed to initialize device. Exiting."
    exit 1
fi

# Main loop
while true; do
    track_usb_devices
    send_system_logs
    update_device_status
    sleep $POLL_INTERVAL
done

