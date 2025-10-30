#!/bin/bash
# ============================================
# USB DEVICE MONITORING SCRIPT FOR LINUX
# ============================================

# Configuration
LOG_FILE="/var/log/usb-devices.log"
WAZUH_LOG="/var/ossec/logs/active-responses.log"
DETAIL_LOG="/var/log/wazuh-usb/usb-events.log"
LOCK_FILE="/var/run/usb-monitor.lock"

# Ensure only one instance runs
if [ -f "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        echo "Script already running with PID $pid"
        exit 1
    fi
fi
echo $$ > "$LOCK_FILE"

# Cleanup on exit
cleanup() {
    rm -f "$LOCK_FILE"
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup EXIT INT TERM

# Create log directories
mkdir -p /var/log/wazuh-usb
touch "$LOG_FILE" "$DETAIL_LOG"

# Initialize logging
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

get_device_details() {
    local device_path=$1
    if [ -d "$device_path" ]; then
        vendor=$(cat "$device_path/idVendor" 2>/dev/null || echo "Unknown")
        product=$(cat "$device_path/idProduct" 2>/dev/null || echo "Unknown")
        manufacturer=$(cat "$device_path/manufacturer" 2>/dev/null || echo "Unknown")
        product_name=$(cat "$device_path/product" 2>/dev/null || echo "Unknown")
        serial=$(cat "$device_path/serial" 2>/dev/null || echo "None")
        
        echo "Vendor=$vendor Product=$product Manufacturer=$manufacturer Name=$product_name Serial=$serial"
    fi
}

monitor_udev() {
    udevadm monitor --property --subsystem-match=usb | while read -r line; do
        if echo "$line" | grep -q "ACTION=add"; then
            sleep 1
            device_info=$(lsusb | tail -1)
            log_message "USB_DEVICE_CONNECTED: $device_info"
            
            # Categorize device
            if echo "$device_info" | grep -iq "keyboard"; then
                log_message "PERIPHERAL_TYPE: KEYBOARD | $device_info"
            elif echo "$device_info" | grep -iq "mouse"; then
                log_message "PERIPHERAL_TYPE: MOUSE | $device_info"
            elif echo "$device_info" | grep -iq "mass storage\|flash"; then
                log_message "PERIPHERAL_TYPE: STORAGE | $device_info"
            elif echo "$device_info" | grep -iq "camera\|webcam"; then
                log_message "PERIPHERAL_TYPE: CAMERA | $device_info"
            elif echo "$device_info" | grep -iq "audio\|sound"; then
                log_message "PERIPHERAL_TYPE: AUDIO | $device_info"
            elif echo "$device_info" | grep -iq "bluetooth"; then
                log_message "PERIPHERAL_TYPE: BLUETOOTH | $device_info"
            elif echo "$device_info" | grep -iq "printer"; then
                log_message "PERIPHERAL_TYPE: PRINTER | $device_info"
            fi
        elif echo "$line" | grep -q "ACTION=remove"; then
            log_message "USB_DEVICE_REMOVED: Device disconnected"
        fi
    done
}

# Monitor storage devices specifically
monitor_storage() {
    while true; do
        storage=$(lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,VENDOR,MODEL 2>/dev/null | grep -E "sd[b-z]|usb")
        if [ ! -z "$storage" ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - USB_STORAGE_DETECTED: $storage" >> "$DETAIL_LOG"
            
            # Get mount points for security monitoring
            mount_points=$(echo "$storage" | awk '$4!="" {print $4}')
            if [ ! -z "$mount_points" ]; then
                log_message "USB_STORAGE_MOUNTED: $mount_points"
            fi
        fi
        sleep 10
    done
}

# Enhanced error handling
handle_error() {
    log_message "ERROR: $1"
    echo "Error: $1" >&2
}

# Start monitoring with error handling
log_message "USB Monitor Started"

# Start monitoring processes
monitor_udev &
monitor_storage &

# Error checking
if ! command -v lsusb >/dev/null 2>&1; then
    handle_error "lsusb command not found. Please install usbutils."
fi

if ! command -v udevadm >/dev/null 2>&1; then
    handle_error "udevadm command not found. Please install udev."
fi

# Wait for background processes
wait
