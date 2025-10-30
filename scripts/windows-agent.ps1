# Windows Device Tracking Agent
# This script collects USB device events, system logs, and sends them to the API

param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$DeviceName = $env:COMPUTERNAME,
    [string]$Owner = $env:USERNAME,
    [string]$Location = "Office"
)

# Configuration
$API_BASE = $ApiUrl
$DEVICE_NAME = $DeviceName
$OWNER = $Owner
$LOCATION = $Location
$DEVICE_ID = $null
$POLL_INTERVAL = 30  # seconds

# Initialize device
function Initialize-Device {
    $osVersion = [System.Environment]::OSVersion.VersionString
    $hostname = [System.Net.Dns]::GetHostName()
    $ipAddress = ([System.Net.Dns]::GetHostAddresses($hostname) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString

    $body = @{
        device_name = $DEVICE_NAME
        device_type = "windows"
        owner = $OWNER
        location = $LOCATION
        hostname = $hostname
        ip_address = $ipAddress
        os_version = $osVersion
        agent_version = "1.0.0"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$API_BASE/api/devices/register" -Method POST -Body $body -ContentType "application/json"
        $script:DEVICE_ID = $response.device_id
        Write-Host "Device registered: $DEVICE_ID"
    } catch {
        Write-Host "Error registering device: $_"
    }
}

# Track USB devices
function Track-USBDevices {
    if (-not $DEVICE_ID) { return }

    # Get current USB devices
    $currentUSBs = Get-WmiObject Win32_USBControllerDevice | ForEach-Object {
        [wmi]$_.Dependent
    } | Where-Object { $_.Name -match "USB" }

    # Store current state
    $stateFile = "$env:TEMP\usb_state.json"
    $previousState = @{}

    if (Test-Path $stateFile) {
        $previousState = Get-Content $stateFile | ConvertFrom-Json
    }

    $currentState = @{}

    foreach ($usb in $currentUSBs) {
        $usbKey = $usb.PNPDeviceID
        $currentState[$usbKey] = $usb.Name

        if (-not $previousState.ContainsKey($usbKey)) {
            # New USB device connected
            Send-USBEvent -Action "insert" -USBName $usb.Name -DeviceType "usb_drive"
        }
    }

    # Check for removed devices
    foreach ($key in $previousState.Keys) {
        if (-not $currentState.ContainsKey($key)) {
            # USB device removed
            Send-USBEvent -Action "remove" -USBName $previousState[$key] -DeviceType "usb_drive"
        }
    }

    $currentState | ConvertTo-Json | Set-Content $stateFile
}

# Send USB event to API
function Send-USBEvent {
    param(
        [string]$Action,
        [string]$USBName,
        [string]$DeviceType
    )

    $body = @{
        device_id = $DEVICE_ID
        usb_name = $USBName
        device_type = $DeviceType
        action = $Action
        serial_number = [guid]::NewGuid().ToString()
        data_transferred_mb = 0
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$API_BASE/api/devices/usb" -Method POST -Body $body -ContentType "application/json" | Out-Null
        Write-Host "USB event sent: $Action - $USBName"
    } catch {
        Write-Host "Error sending USB event: $_"
    }
}

# Collect and send logs
function Send-Logs {
    if (-not $DEVICE_ID) { return }

    # Get recent security logs
    $logs = Get-EventLog -LogName Security -Newest 10 -ErrorAction SilentlyContinue

    foreach ($log in $logs) {
        $body = @{
            device_id = $DEVICE_ID
            log_type = "security"
            source = "Windows Event Log"
            severity = if ($log.Type -eq "Error") { "error" } else { "info" }
            message = $log.Message
            event_code = $log.EventID
            timestamp = $log.TimeGenerated.ToUniversalTime().ToString("o")
            raw_data = @{
                source = $log.Source
                type = $log.Type
                user = $log.UserName
            }
        } | ConvertTo-Json -Depth 10

        try {
            Invoke-RestMethod -Uri "$API_BASE/api/logs" -Method POST -Body $body -ContentType "application/json" | Out-Null
        } catch {
            Write-Host "Error sending log: $_"
        }
    }
}

# Update device status
function Update-DeviceStatus {
    if (-not $DEVICE_ID) { return }

    $body = @{
        device_id = $DEVICE_ID
        status = "online"
        security_status = "secure"
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$API_BASE/api/devices/status" -Method POST -Body $body -ContentType "application/json" | Out-Null
    } catch {
        Write-Host "Error updating device status: $_"
    }
}

# Main loop
Write-Host "Starting Windows Device Tracking Agent..."
Initialize-Device

while ($true) {
    Track-USBDevices
    Send-Logs
    Update-DeviceStatus
    Start-Sleep -Seconds $POLL_INTERVAL
}
