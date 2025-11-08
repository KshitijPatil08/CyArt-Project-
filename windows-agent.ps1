# ==========================================================
# Windows Device Tracking Agent v2.0
# Tracks hardware connections (USB, Mouse, Keyboard, Printer, Charger)
# Sends logs & status updates to Vercel API backend
# ==========================================================

param(
    [string]$ApiUrl = "https://v0-project1-r9.vercel.app",
    [string]$DeviceName = $env:COMPUTERNAME,
    [string]$Owner = $env:USERNAME,
    [string]$Location = "Office"
)

# ----------------------------------------------------------
# CONFIGURATION
# ----------------------------------------------------------
$API_BASE = $ApiUrl
$DEVICE_NAME = $DeviceName
$OWNER = $Owner
$LOCATION = $Location
$DEVICE_ID = $null
$POLL_INTERVAL = 30   # seconds

$ErrorActionPreference = "Continue"

# ----------------------------------------------------------
# REGISTER DEVICE
# ----------------------------------------------------------
function Initialize-Device {
    $osVersion = [System.Environment]::OSVersion.VersionString
    $hostname = [System.Net.Dns]::GetHostName()
    $ipAddress = (
        [System.Net.Dns]::GetHostAddresses($hostname) |
        Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
        Select-Object -First 1
    ).IPAddressToString

    $body = @{
        device_name   = $DEVICE_NAME
        device_type   = "windows"
        owner         = $OWNER
        location      = $LOCATION
        hostname      = $hostname
        ip_address    = $ipAddress
        os_version    = $osVersion
        agent_version = "2.0.0"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$API_BASE/api/devices/register" -Method POST -Body $body -ContentType "application/json"
        $script:DEVICE_ID = $response.device_id
        Write-Host "Device registered with ID: $DEVICE_ID"
    } catch {
        Write-Host "Error registering device: $_"
    }
}

# ----------------------------------------------------------
# HELPERS
# ----------------------------------------------------------
function Convert-JsonToHashtable($jsonPath) {
    if (-not (Test-Path $jsonPath)) { return @{} }
    $json = Get-Content $jsonPath -Raw | ConvertFrom-Json
    $ht = @{}
    if ($null -ne $json) {
        foreach ($prop in $json.PSObject.Properties) { $ht[$prop.Name] = $prop.Value }
    }
    return $ht
}

# ----------------------------------------------------------
# GENERIC HARDWARE TRACKER
# ----------------------------------------------------------
function Track-Hardware {
    if (-not $DEVICE_ID) { return }

    $hardwareTypes = @{
        "usb"      = "USB"
        "mouse"    = "MOUSE"
        "keyboard" = "KEYBOARD"
        "printer"  = "PRINTER"
        "charger"  = "Battery"
    }

    foreach ($type in $hardwareTypes.Keys) {
        $pattern = $hardwareTypes[$type]
        $stateFile = "$env:TEMP\${type}_state.json"

        # Get currently connected devices
        $currentDevices = Get-CimInstance -Class Win32_PnPEntity -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $pattern }

        $currentState = @{}
        foreach ($d in $currentDevices) {
            if ($null -ne $d.PNPDeviceID) {
                $currentState[$d.PNPDeviceID] = $d.Name
            }
        }

        $previousState = Convert-JsonToHashtable $stateFile

        # Detect new connections
        foreach ($key in $currentState.Keys) {
            if (-not $previousState.ContainsKey($key)) {
                $name = $currentState[$key]
                Write-Host "$type connected: $name"
                $body = @{
                    device_id      = $DEVICE_ID
                    log_type       = "hardware"
                    hardware_type  = $type
                    event          = "connected"
                    source         = "windows-agent"
                    severity       = "info"
                    message        = "$type connected: $name"
                    timestamp      = (Get-Date).ToUniversalTime().ToString("o")
                } | ConvertTo-Json

                try {
                    Invoke-RestMethod -Uri "$API_BASE/api/devices/log" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
                } catch {
                    Write-Host "Failed to send connect event: $_"
                }
            }
        }

        # Detect disconnections
        foreach ($key in $previousState.Keys) {
            if (-not $currentState.ContainsKey($key)) {
                $name = $previousState[$key]
                Write-Host "$type disconnected: $name"
                $body = @{
                    device_id      = $DEVICE_ID
                    log_type       = "hardware"
                    hardware_type  = $type
                    event          = "disconnected"
                    source         = "windows-agent"
                    severity       = "info"
                    message        = "$type disconnected: $name"
                    timestamp      = (Get-Date).ToUniversalTime().ToString("o")
                } | ConvertTo-Json

                try {
                    Invoke-RestMethod -Uri "$API_BASE/api/devices/log" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
                } catch {
                    Write-Host "Failed to send disconnect event: $_"
                }
            }
        }

        ($currentState | ConvertTo-Json) | Set-Content -Path $stateFile
    }
}

# ----------------------------------------------------------
# SECURITY LOGS
# ----------------------------------------------------------
function Send-Logs {
    if (-not $DEVICE_ID) { return }

    $logs = Get-EventLog -LogName Security -Newest 10 -ErrorAction SilentlyContinue
    foreach ($log in $logs) {
        $body = @{
            device_id  = $DEVICE_ID
            log_type   = "security"
            source     = "Windows Event Log"
            severity   = if ($log.EntryType -eq "Error") { "error" } else { "info" }
            message    = $log.Message
            event_code = $log.EventID
            timestamp  = $log.TimeGenerated.ToUniversalTime().ToString("o")
            raw_data   = @{
                source = $log.Source
                type   = $log.EntryType
                user   = $log.UserName
            }
        } | ConvertTo-Json -Depth 10

        try {
            Invoke-RestMethod -Uri "$API_BASE/api/devices/log" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
        } catch {
            Write-Host "Error sending log: $_"
        }
    }
}

# ----------------------------------------------------------
# DEVICE STATUS
# ----------------------------------------------------------
function Update-DeviceStatus {
    if (-not $DEVICE_ID) { return }
    $body = @{
        device_id = $DEVICE_ID
        status = "online"
        security_status = "secure"
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$API_BASE/api/devices/status" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "Error updating device status: $_"
    }
}

# ----------------------------------------------------------
# CLEAN EXIT HANDLER
# ----------------------------------------------------------
$OnExit = {
    if ($DEVICE_ID) {
        Write-Host "Sending final offline update before exit..."
        try {
            $body = @{
                device_id = $DEVICE_ID
                status = "offline"
                security_status = "unknown"
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$API_BASE/api/devices/status" -Method POST -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-Host "Failed to send offline status: $_"
        }
    }
}

Register-EngineEvent PowerShell.Exiting -Action $OnExit | Out-Null

# ----------------------------------------------------------
# MAIN LOOP
# ----------------------------------------------------------
Write-Host "Starting Windows Device Tracking Agent..."
Initialize-Device
Write-Host "Monitoring hardware every $POLL_INTERVAL seconds..."

while ($true) {
    Track-Hardware
    Send-Logs
    Update-DeviceStatus
    Start-Sleep -Seconds $POLL_INTERVAL
}