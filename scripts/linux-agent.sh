#!/bin/bash

# Enhanced Linux Device Tracking Agent with Full Feature Parity
# Includes: USB Policies, Quarantine, Network Discovery (SNMP), Network Monitoring, Software Auditing

API_URL="${1:-https://lily-recrudescent-scantly.ngrok-free.dev}"
AGENT_KEY="${2:-CyArtAgent_Secret_2026}"
DEVICE_NAME="${3:-$(hostname)}"
OWNER="${4:-$(whoami)}"
LOCATION="${5:-Office}"
DEVICE_ID=""
POLL_INTERVAL=30
REGISTRATION_FILE="$HOME/.cyart-agent/device_id.txt"
LOG_FILE="$HOME/.cyart-agent/agent.log"
STATE_FILE="$HOME/.cyart-agent/agent_state.json"
POLICIES_FILE="$HOME/.cyart-agent/usb_policies.json"
AUDITED_SOFTWARE_FILE="$HOME/.cyart-agent/audited_software.txt"

# Policy and State Variables
QUARANTINED=false
USB_DATA_LIMIT_MB=0
USB_READ_ONLY=false
USB_EXPIRATION=""
USB_USAGE_MB=0
LAST_RESET_DATE=""
declare -A USB_USAGE_MAP
declare -a CURRENT_POLICIES
APPROVED_SOFTWARE=()

# Ensure directory exists
mkdir -p "$HOME/.cyart-agent"

# Logging function
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" >> "$LOG_FILE"
    echo "[$timestamp] $message"
}

# Save agent state
save_agent_state() {
    local state_json="{"
    state_json+="\"usb_usage_mb\": $USB_USAGE_MB,"
    state_json+="\"last_reset_date\": \"$LAST_RESET_DATE\","
    state_json+="\"usb_usage_map\": {"
    
    local first=true
    for serial in "${!USB_USAGE_MAP[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            state_json+=","
        fi
        state_json+="\"$serial\": ${USB_USAGE_MAP[$serial]}"
    done
    
    state_json+="}}"
    echo "$state_json" > "$STATE_FILE"
}

# Load agent state
load_agent_state() {
    if [ -f "$STATE_FILE" ]; then
        USB_USAGE_MB=$(jq -r '.usb_usage_mb // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        LAST_RESET_DATE=$(jq -r '.last_reset_date // ""' "$STATE_FILE" 2>/dev/null || echo "")
        
        # Load USB usage map
        if command -v jq >/dev/null 2>&1; then
            while IFS="=" read -r key value; do
                USB_USAGE_MAP["$key"]="$value"
            done < <(jq -r '.usb_usage_map | to_entries | .[] | "\(.key)=\(.value)"' "$STATE_FILE" 2>/dev/null)
        fi
        
        log_message "Loaded agent state: ${USB_USAGE_MB} MB used today"
    fi
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

    local os_version=$(uname -r)
    local distro=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || echo "Linux")
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
    "os_version": "$distro",
    "agent_version": "3.0.0"
}
EOF
)

    response=$(curl -s -X POST "$API_URL/api/devices/register" \
        -H "Content-Type: application/json" \
        -H "x-agent-key: $AGENT_KEY" \
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

# Check quarantine status and fetch policies
check_quarantine_and_policies() {
    if [ -z "$DEVICE_ID" ]; then
        return
    fi

    local response=$(curl -s -H "x-agent-key: $AGENT_KEY" "$API_URL/api/devices/quarantine/status?device_id=$DEVICE_ID" 2>/dev/null)
    
    if [ -z "$response" ]; then
        return
    fi

    # Parse quarantine status
    local is_quarantined=$(echo "$response" | jq -r '.is_quarantined // false' 2>/dev/null)
    local quarantine_reason=$(echo "$response" | jq -r '.quarantine_reason // ""' 2>/dev/null)
    
    # Update global policies
    USB_DATA_LIMIT_MB=$(echo "$response" | jq -r '.usb_data_limit_mb // 0' 2>/dev/null || echo "0")
    USB_READ_ONLY=$(echo "$response" | jq -r '.usb_read_only // false' 2>/dev/null)
    USB_EXPIRATION=$(echo "$response" | jq -r '.usb_expiration // ""' 2>/dev/null)
    
    # Save policies
    echo "$response" | jq -r '.usb_policies // []' 2>/dev/null > "$POLICIES_FILE"
    
    # Handle quarantine state change
    if [ "$is_quarantined" = "true" ] && [ "$QUARANTINED" != "true" ]; then
        QUARANTINED=true
        log_message "⚠️ QUARANTINE ENFORCED: $quarantine_reason"
        enforce_quarantine "$quarantine_reason"
    elif [ "$is_quarantined" = "false" ] && [ "$QUARANTINED" = "true" ]; then
        QUARANTINED=false
        log_message "✅ Quarantine Released"
        release_quarantine
    fi
}

# Check USB policies
check_usb_policies() {
    local action="allow"
    local reason=""
    
    # Check global expiration
    if [ -n "$USB_EXPIRATION" ]; then
        local expiry_date=$(date -d "$USB_EXPIRATION" +%s 2>/dev/null || echo "0")
        local current_date=$(date +%s)
        local expiry_end=$((expiry_date + 86400))
        
        if [ $current_date -gt $expiry_end ]; then
            echo "block:Global USB Access Expired on $USB_EXPIRATION"
            return
        fi
    fi
    
    # Check global data limit
    if [ "$USB_DATA_LIMIT_MB" -gt 0 ]; then
        local usage_check=$(echo "$USB_USAGE_MB >= $USB_DATA_LIMIT_MB" | bc -l 2>/dev/null || echo "0")
        if [ "$usage_check" = "1" ]; then
            echo "block:Global USB Data Limit Reached ($USB_USAGE_MB / $USB_DATA_LIMIT_MB MB)"
            return
        fi
    fi
    
    # Check read-only
    if [ "$USB_READ_ONLY" = "true" ]; then
        echo "readonly"
        return
    fi
    
    echo "allow"
}

# Block USB storage
block_usb_storage() {
    log_message "🔒 Blocking USB Storage..."
    
    # Unmount all USB devices
    lsblk -o NAME,TYPE,MOUNTPOINT | grep -E "part.*/" | awk '{print $3}' | while read -r mountpoint; do
        if [[ "$mountpoint" == /media/* ]] || [[ "$mountpoint" == /mnt/* ]]; then
            umount "$mountpoint" 2>/dev/null
            log_message "Unmounted: $mountpoint"
        fi
    done
}

# Set USB read-only
set_usb_readonly() {
    log_message "🔒 Enforcing USB Read-Only Mode..."
    
    # Remount all USB devices as read-only
    lsblk -o NAME,TYPE,MOUNTPOINT | grep -E "part.*/" | awk '{print $3}' | while read -r mountpoint; do
        if [[ "$mountpoint" == /media/* ]] || [[ "$mountpoint" == /mnt/* ]]; then
            mount -o remount,ro "$mountpoint" 2>/dev/null
            log_message "Remounted read-only: $mountpoint"
        fi
    done
}

# Set USB read-write
set_usb_readwrite() {
    log_message "🔓 Restoring USB Read-Write Mode..."
    
    # Remount all USB devices as read-write
    lsblk -o NAME,TYPE,MOUNTPOINT | grep -E "part.*/" | awk '{print $3}' | while read -r mountpoint; do
        if [[ "$mountpoint" == /media/* ]] || [[ "$mountpoint" == /mnt/* ]]; then
            mount -o remount,rw "$mountpoint" 2>/dev/null
            log_message "Remounted read-write: $mountpoint"
        fi
    done
}

# Enforce quarantine
enforce_quarantine() {
    local reason="$1"
    
    # Send log before blocking network
    send_log "security" "agent-quarantine" "critical" "Device Quarantined: $reason" "{}"
    
    # Block USB
    block_usb_storage
    
    # Block network
    block_network
}

# Release quarantine
release_quarantine() {
    # Unblock network
    unblock_network
    
    # Send log after restoring network
    sleep 5
    send_log "security" "agent-quarantine" "info" "Device Released from Quarantine" "{}"
}

# Block network
block_network() {
    log_message "🔒 Disabling Network Interfaces..."
    
    # Get all active interfaces except loopback
    ip link show | grep -E "^[0-9]+: " | awk -F': ' '{print $2}' | grep -v "lo" | while read -r iface; do
        ip link set "$iface" down 2>/dev/null
        log_message "Disabled: $iface"
    done
}

# Unblock network
unblock_network() {
    log_message "🔓 Re-enabling Network Interfaces..."
    
    # Re-enable all interfaces
    ip link show | grep -E "^[0-9]+: " | awk -F': ' '{print $2}' | grep -v "lo" | while read -r iface; do
        ip link set "$iface" up 2>/dev/null
        log_message "Enabled: $iface"
    done
}

# Track USB data usage
track_usb_data_usage() {
    # Daily reset
    local today=$(date '+%Y-%m-%d')
    if [ "$LAST_RESET_DATE" != "$today" ]; then
        log_message "📅 New Day: Resetting USB usage (was $USB_USAGE_MB MB)"
        USB_USAGE_MB=0
        USB_USAGE_MAP=()
        LAST_RESET_DATE="$today"
    fi
    
    # Monitor USB write activity using iostat
    if command -v iostat >/dev/null 2>&1; then
        local usb_devices=$(lsblk -dno NAME,TYPE | grep disk | awk '{print $1}' | grep -E "sd[b-z]")
        
        for device in $usb_devices; do
            local write_kb=$(iostat -d "/dev/$device" 1 1 | tail -1 | awk '{print $5}' 2>/dev/null || echo "0")
            local write_mb=$(echo "scale=2; $write_kb / 1024" | bc -l 2>/dev/null || echo "0")
            
            if [ "$(echo "$write_mb > 0.01" | bc -l)" = "1" ]; then
                USB_USAGE_MB=$(echo "$USB_USAGE_MB + $write_mb" | bc -l)
                log_message "📊 USB Write Activity: $write_mb MB on /dev/$device"
            fi
        done
    fi
    
    save_agent_state
}

# Scan network topology (SNMP)
scan_network_topology() {
    if [ "$QUARANTINED" = "true" ]; then
        return
    fi
    
    log_message "Starting Network Topology Scan (SNMP)..."
    
    # Get local subnet
    local ip=$(hostname -I | awk '{print $1}')
    local subnet=$(echo "$ip" | cut -d'.' -f1-3)
    
    # Scan subnet for SNMP devices
    scan_snmp_devices "$subnet"
}

# Scan SNMP devices
scan_snmp_devices() {
    local subnet="$1"
    local community_strings=("public" "private")
    
    if ! command -v snmpget >/dev/null 2>&1; then
        log_message "SNMP tools not installed. Skipping network discovery."
        return
    fi
    
    for i in {1..254}; do
        local ip="${subnet}.${i}"
        
        for community in "${community_strings[@]}"; do
            local sys_name=$(snmpget -v2c -c "$community" -t 1 -r 0 "$ip" SNMPv2-MIB::sysName.0 2>/dev/null | cut -d':' -f4 | tr -d ' ')
            
            if [ -n "$sys_name" ]; then
                local sys_descr=$(snmpget -v2c -c "$community" -t 1 "$ip" SNMPv2-MIB::sysDescr.0 2>/dev/null | cut -d':' -f4-)
                
                # Identify device type
                local hw_type="switch"
                if echo "$sys_descr" | grep -qi "router\|gateway"; then
                    hw_type="router"
                elif echo "$sys_descr" | grep -qi "access point\|ap"; then
                    hw_type="wifi_ap"
                fi
                
                log_message "SNMP Found: $sys_name ($ip) [$hw_type]"
                send_network_discovery "$ip" "$sys_name" "$sys_descr" "$hw_type" "snmp"
                break
            fi
        done
    done
}

# Send network discovery log
send_network_discovery() {
    local ip="$1"
    local name="$2"
    local descr="$3"
    local hw_type="$4"
    local method="$5"
    
    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    local raw_data="{\"ip\": \"$ip\", \"switch_name\": \"$name\", \"description\": \"$descr\", \"discovery_method\": \"$method\"}"
    
    send_log "network_topology" "agent-$method" "info" "Network Device Discovered: $name ($ip)" "$raw_data" "$hw_type" "$method"
}

# Track network connections
track_network_connections() {
    if [ "$QUARANTINED" = "true" ]; then
        return
    fi
    
    # Use ss or netstat to get connections
    if command -v ss >/dev/null 2>&1; then
        ss -tunap 2>/dev/null | tail -n +2 | head -10 | while read -r line; do
            local proto=$(echo "$line" | awk '{print $1}')
            local local_addr=$(echo "$line" | awk '{print $5}')
            local remote_addr=$(echo "$line" | awk '{print $6}')
            local process=$(echo "$line" | awk '{print $7}' | cut -d'"' -f2)
            
            if [ -n "$remote_addr" ] && [ "$remote_addr" != "*:*" ]; then
                send_connection_log "$proto" "$local_addr" "$remote_addr" "$process"
            fi
        done
    fi
}

# Send connection log
send_connection_log() {
    local proto="$1"
    local local_addr="$2"
    local remote_addr="$3"
    local process="$4"
    
    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    local raw_data="{\"protocol\": \"$proto\", \"local_address\": \"$local_addr\", \"remote_address\": \"$remote_addr\", \"process\": \"$process\"}"
    
    send_log "network" "agent-network-monitor" "info" "Network Connection: $process -> $remote_addr" "$raw_data"
}

# Audit downloads for unapproved software
audit_downloads() {
    if [ "$QUARANTINED" = "true" ]; then
        return
    fi
    
    local downloads_dir="$HOME/Downloads"
    
    # Find executables
    find "$downloads_dir" -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \) -mtime -1 2>/dev/null | while read -r file; do
        local filename=$(basename "$file")
        
        # Check if already audited
        if grep -q "$filename" "$AUDITED_SOFTWARE_FILE" 2>/dev/null; then
            continue
        fi
        
        # Check if approved
        if ! is_software_approved "$filename"; then
            # Block by renaming
            mv "$file" "${file}.blocked" 2>/dev/null
            log_message "🚫 Blocked unapproved software: $filename"
            
            # Send approval request
            send_software_approval_request "$filename"
        fi
        
        # Mark as audited
        echo "$filename" >> "$AUDITED_SOFTWARE_FILE"
    done
}

# Check if software is approved
is_software_approved() {
    local filename="$1"
    
    for approved in "${APPROVED_SOFTWARE[@]}"; do
        if [[ "$filename" == *"$approved"* ]]; then
            return 0
        fi
    done
    
    return 1
}

# Send software approval request
send_software_approval_request() {
    local filename="$1"
    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    
    local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "device_name": "$DEVICE_NAME",
    "hostname": "$(hostname)",
    "log_type": "security",
    "source": "agent-software-audit",
    "severity": "warning",
    "message": "Unapproved Software Detected: $filename",
    "timestamp": "$timestamp",
    "raw_data": {
        "filename": "$filename",
        "status": "blocked"
    }
}
EOF
)
    
    curl -s -X POST "$API_URL/api/agent-log" \
        -H "Content-Type: application/json" \
        -H "x-agent-key: $AGENT_KEY" \
        -d "$payload" > /dev/null
}

# Get USB device details
get_usb_details() {
    local device_path="$1"
    local details="{}"
    
    if [ -n "$device_path" ]; then
        local vendor_id=$(udevadm info -q property -p "$device_path" 2>/dev/null | grep ID_VENDOR_ID | cut -d'=' -f2)
        local product_id=$(udevadm info -q property -p "$device_path" 2>/dev/null | grep ID_SERIAL_SHORT | cut -d'=' -f2)
        local vendor_name=$(udevadm info -q property -p "$device_path" 2>/dev/null | grep ID_VENDOR | cut -d'=' -f2)
        local product_name=$(udevadm info -q property -p "$device_path" 2>/dev/null | grep ID_MODEL | cut -d'=' -f2)
        
        if [ -n "$vendor_id" ] || [ -n "$product_id" ]; then
            details=$(cat <<EOF
{
    "vendor_id": "${vendor_id:-}",
    "product_id": "${product_id:-}",
    "vendor_name": "${vendor_name:-}",
    "product_name": "${product_name:-}",
    "serial_number": "${product_id:-UNKNOWN}"
}
EOF
)
        fi
    fi
    
    echo "$details"
}

# Track USB devices
track_usb_devices() {
    if [ -z "$DEVICE_ID" ] || [ "$QUARANTINED" = "true" ]; then
        return
    fi

    local state_file="/tmp/usb_state.json"
    local current_usbs="{}"
    
    # Get current USB devices
    while IFS= read -r device; do
        if [ -n "$device" ]; then
            local device_name=$(lsblk -dno NAME,MODEL "$device" 2>/dev/null | awk '{print $2}' || echo "USB Device")
            local serial=$(udevadm info -q property -p "/sys/block/$(basename $device)" 2>/dev/null | grep ID_SERIAL_SHORT | cut -d'=' -f2 || echo "UNKNOWN")
            current_usbs=$(echo "$current_usbs" | jq -r --arg dev "$device" --arg name "$device_name" --arg ser "$serial" '. + {($dev): {"name": $name, "serial": $ser}}' 2>/dev/null || echo "$current_usbs")
        fi
    done < <(lsblk -dno NAME,TYPE | grep -E "disk|part" | awk '{print "/dev/"$1}')

    # Get previous state
    local previous_state="{}"
    if [ -f "$state_file" ]; then
        previous_state=$(cat "$state_file" 2>/dev/null || echo "{}")
    fi

    # Check for new USB devices
    if command -v jq >/dev/null 2>&1; then
        echo "$current_usbs" | jq -r 'keys[]' 2>/dev/null | while read -r device; do
            if ! echo "$previous_state" | jq -e --arg dev "$device" 'has($dev)' >/dev/null 2>&1; then
                local device_name=$(echo "$current_usbs" | jq -r --arg dev "$device" '.[$dev].name // "USB Device"')
                local serial=$(echo "$current_usbs" | jq -r --arg dev "$device" '.[$dev].serial // "UNKNOWN"')
                send_usb_event "connected" "$device_name" "$serial" "$device"
            fi
        done

        # Check for removed USB devices
        echo "$previous_state" | jq -r 'keys[]' 2>/dev/null | while read -r device; do
            if ! echo "$current_usbs" | jq -e --arg dev "$device" 'has($dev)' >/dev/null 2>&1; then
                local device_name=$(echo "$previous_state" | jq -r --arg dev "$device" '.[$dev].name // "USB Device"')
                send_usb_event "disconnected" "$device_name" "UNKNOWN" "$device"
            fi
        done
    fi

    # Save current state
    echo "$current_usbs" > "$state_file"
    
    # Apply USB policies
    local policy_result=$(check_usb_policies)
    local action=$(echo "$policy_result" | cut -d':' -f1)
    
    if [ "$action" = "block" ]; then
        block_usb_storage
    elif [ "$action" = "readonly" ]; then
        set_usb_readonly
    else
        set_usb_readwrite
    fi
}

# Send USB event to API
send_usb_event() {
    local action=$1
    local usb_name=$2
    local serial=$3
    local device_path=$4

    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    local raw_data="{\"usb_name\": \"$usb_name\", \"serial_number\": \"$serial\", \"device_path\": \"$device_path\"}"

    send_log "usb" "linux-agent" "info" "USB device $action: $usb_name" "$raw_data" "usb" "$action"
}

# Generic send log function
send_log() {
    local log_type="$1"
    local source="$2"
    local severity="$3"
    local message="$4"
    local raw_data="${5:-{}}"
    local hw_type="${6:-}"
    local event="${7:-}"

    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    local payload=$(cat <<EOF
{
    "device_id": "$DEVICE_ID",
    "device_name": "$DEVICE_NAME",
    "hostname": "$(hostname)",
    "log_type": "$log_type",
    "source": "$source",
    "severity": "$severity",
    "message": "$message",
    "timestamp": "$timestamp",
    "raw_data": $raw_data
EOF
)

    if [ -n "$hw_type" ]; then
        payload+=", \"hardware_type\": \"$hw_type\""
    fi
    
    if [ -n "$event" ]; then
        payload+=", \"event\": \"$event\""
    fi
    
    payload+="}"

    curl -s -X POST "$API_URL/api/agent-log" \
        -H "Content-Type: application/json" \
        -H "x-agent-key: $AGENT_KEY" \
        -d "$payload" > /dev/null
}

# Collect and send system logs
send_system_logs() {
    if [ -z "$DEVICE_ID" ] || [ "$QUARANTINED" = "true" ]; then
        return
    fi

    # Get auth logs (security)
    if [ -f /var/log/auth.log ]; then
        tail -5 /var/log/auth.log 2>/dev/null | while IFS= read -r log; do
            [ -z "$log" ] && continue
            
            local severity="info"
            if echo "$log" | grep -qi "failed\|error\|denied"; then
                severity="high"
            fi

            send_log "security" "syslog - auth.log" "$severity" "$log" "{}"
        done
    fi

    # Get system logs
    if [ -f /var/log/syslog ]; then
        tail -5 /var/log/syslog 2>/dev/null | while IFS= read -r log; do
            [ -z "$log" ] && continue
            
            local severity="info"
            if echo "$log" | grep -qi "error\|critical\|fail"; then
                severity="error"
            elif echo "$log" | grep -qi "warn"; then
                severity="warning"
            fi

            send_log "system" "syslog" "$severity" "$log" "{}"
        done
    fi
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
        -H "x-agent-key: $AGENT_KEY" \
        -d "$payload" > /dev/null
}

# Main execution
log_message "Starting Enhanced Linux Device Tracking Agent v3.0.0..."
initialize_device
load_agent_state

if [ -z "$DEVICE_ID" ]; then
    log_message "Failed to initialize device. Exiting."
    exit 1
fi

# Start background monitoring processes
{
    while true; do
        check_quarantine_and_policies
        sleep 3
    done
} &

{
    while true; do
        track_usb_devices
        sleep 2
    done
} &

{
    while true; do
        track_usb_data_usage
        sleep 2
    done
} &

{
    while true; do
        track_network_connections
        sleep 15
    done
} &

{
    while true; do
        send_system_logs
        audit_downloads
        sleep 30
    done
} &

{
    while true; do
        scan_network_topology
        sleep 5  # 2 seconds - fast discovery
    done
} &

{
    while true; do
        update_device_status
        sleep 5
    done
} &

# Keep script running
log_message "All monitoring processes started. Agent running in background."
wait
