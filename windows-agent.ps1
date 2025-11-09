# ==========================================================
# Windows Device Tracking Agent v3.0
# Compatible with Supabase Backend
# ==========================================================

param(
    [string]$ApiUrl     = "https://v0-project1-r9.vercel.app",
    [string]$DeviceName = $env:COMPUTERNAME,
    [string]$Owner      = $env:USERNAME,
    [string]$Location   = "Office"
)

# ----------------------------------------------------------
# CONFIGURATION
# ----------------------------------------------------------
$global:API_BASE    = $ApiUrl
$global:DEVICE_NAME = $DeviceName
$global:OWNER       = $Owner
$global:LOCATION    = $Location
$global:DEVICE_ID   = $null
$global:HOSTNAME    = [System.Net.Dns]::GetHostName()
$ErrorActionPreference = "Continue"

# ----------------------------------------------------------
# DEVICE REGISTRATION
# ----------------------------------------------------------
function Initialize-Device {
    Write-Host "[+] Registering device with backend..."

    $osVersion = [System.Environment]::OSVersion.VersionString
    $ipAddress = (
        [System.Net.Dns]::GetHostAddresses($global:HOSTNAME) |
        Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
        Select-Object -First 1
    ).IPAddressToString

    $body = @{
        device_name   = $global:DEVICE_NAME
        device_type   = "windows"
        owner         = $global:OWNER
        location      = $global:LOCATION
        hostname      = $global:HOSTNAME
        ip_address    = $ipAddress
        os_version    = $osVersion
        agent_version = "3.0.0"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$global:API_BASE/api/devices/register" `
            -Method POST -Body $body -ContentType "application/json"
        $global:DEVICE_ID = $response.device_id
        Write-Host "[+] Device registered successfully"
        Write-Host "    Device ID: $global:DEVICE_ID"
        Write-Host "    Hostname: $global:HOSTNAME"
    }
    catch {
        Write-Host "[-] Registration failed: $_"
        Write-Host "    Check if API is accessible at: $global:API_BASE/api/devices/register"
    }
}

# ----------------------------------------------------------
# STATUS UPDATES
# ----------------------------------------------------------
function Update-DeviceStatus {
    param (
        [string]$status = "online",
        [string]$security_status = "secure"
    )

    if (-not $global:DEVICE_ID) { return }

    $body = @{
        device_id       = $global:DEVICE_ID
        status          = $status
        security_status = $security_status
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$global:API_BASE/api/devices/status" `
            -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
    }
    catch {
        Write-Host "[-] Failed to update status"
    }
}

# ----------------------------------------------------------
# GET USB DEVICE DETAILS
# ----------------------------------------------------------
function Get-UsbDeviceDetails {
    try {
        $usbDevices = Get-PnpDevice | Where-Object {
            $_.Class -eq "USB" -and $_.Status -eq "OK"
        } | Select-Object -First 1

        if ($usbDevices) {
            $instanceId = $usbDevices.InstanceId
            
            # Extract VID and PID
            if ($instanceId -match "VID_([0-9A-F]{4})") {
                $vendorId = $matches[1]
            }
            if ($instanceId -match "PID_([0-9A-F]{4})") {
                $productId = $matches[1]
            }

            return @{
                device_name = $usbDevices.FriendlyName
                vendor_id = $vendorId
                product_id = $productId
                instance_id = $instanceId
            }
        }
    }
    catch {
        Write-Host "[-] Error getting USB details: $_"
    }
    
    return $null
}

# ----------------------------------------------------------
# SEND LOG EVENT
# ----------------------------------------------------------
function Send-LogEvent {
    param (
        [string]$log_type,
        [string]$hardware_type,
        [string]$event,
        [string]$message,
        [string]$severity = "info",
        [hashtable]$raw_data = @{}
    )

    if (-not $global:DEVICE_ID) { 
        Write-Host "[-] No DEVICE_ID available, cannot send event"
        return 
    }

    $timestamp = (Get-Date).ToUniversalTime().ToString("o")

    $body = @{
        device_id     = $global:DEVICE_ID
        device_name   = $global:DEVICE_NAME
        hostname      = $global:HOSTNAME
        log_type      = $log_type
        hardware_type = $hardware_type
        event         = $event
        source        = "windows-agent"
        severity      = $severity
        message       = $message
        timestamp     = $timestamp
        event_code    = $null
        raw_data      = $raw_data
    }

    # Remove null values
    $body = $body.GetEnumerator() | Where-Object { $_.Value -ne $null } | 
        ForEach-Object -Begin { $h = @{} } -Process { $h[$_.Key] = $_.Value } -End { $h }

    $jsonBody = $body | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Uri "$global:API_BASE/api/logs" `
            -Method POST -Body $jsonBody -ContentType "application/json" -ErrorAction Stop
        
        Write-Host "[+] Event logged: $hardware_type $event"
        return $response
    }
    catch {
        Write-Host "[-] Failed to send event: $_"
        Write-Host "    Endpoint: $global:API_BASE/api/logs"
        return $null
    }
}

# ----------------------------------------------------------
# USB EVENT HANDLERS
# ----------------------------------------------------------
function Register-UsbEventHandlers {
    Write-Host "[+] Registering USB event handlers..."

    # Cleanup existing handlers
    try {
        Unregister-Event -SourceIdentifier "USBInsert" -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier "USBRemove" -ErrorAction SilentlyContinue
    } catch {}

    # USB Insert Event
    $insertQuery = "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBControllerDevice'"
    Register-WmiEvent -Query $insertQuery -SourceIdentifier "USBInsert" -Action {
        Write-Host ""
        Write-Host "[!] USB DEVICE CONNECTED!" -ForegroundColor Green
        Write-Host "    Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        
        Start-Sleep -Milliseconds 500
        
        # Get device details
        $usbDetails = Get-UsbDeviceDetails
        $deviceName = if ($usbDetails) { $usbDetails.device_name } else { "Unknown USB Device" }
        
        $timestamp = (Get-Date).ToUniversalTime().ToString("o")
        
        $body = @{
            device_id     = $global:DEVICE_ID
            device_name   = $global:DEVICE_NAME
            hostname      = $global:HOSTNAME
            log_type      = "hardware"
            hardware_type = "usb"
            event         = "connected"
            source        = "windows-agent"
            severity      = "info"
            message       = "USB device connected: $deviceName"
            timestamp     = $timestamp
            raw_data      = $usbDetails
        } | ConvertTo-Json -Depth 5

        try {
            $response = Invoke-RestMethod -Uri "$global:API_BASE/api/logs" `
                -Method POST -Body $body -ContentType "application/json"
            Write-Host "    [OK] Event sent to backend"
            
            if ($usbDetails) {
                Write-Host "    Device: $($usbDetails.device_name)"
                Write-Host "    VID: $($usbDetails.vendor_id) | PID: $($usbDetails.product_id)"
            }
        }
        catch {
            Write-Host "    [ERROR] Failed to send event: $_" -ForegroundColor Red
        }
        Write-Host ""
    } | Out-Null

    # USB Remove Event
    $removeQuery = "SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBControllerDevice'"
    Register-WmiEvent -Query $removeQuery -SourceIdentifier "USBRemove" -Action {
        Write-Host ""
        Write-Host "[!] USB DEVICE DISCONNECTED!" -ForegroundColor Yellow
        Write-Host "    Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        
        $timestamp = (Get-Date).ToUniversalTime().ToString("o")
        
        $body = @{
            device_id     = $global:DEVICE_ID
            device_name   = $global:DEVICE_NAME
            hostname      = $global:HOSTNAME
            log_type      = "hardware"
            hardware_type = "usb"
            event         = "disconnected"
            source        = "windows-agent"
            severity      = "info"
            message       = "USB device disconnected"
            timestamp     = $timestamp
        } | ConvertTo-Json -Depth 5

        try {
            $response = Invoke-RestMethod -Uri "$global:API_BASE/api/logs" `
                -Method POST -Body $body -ContentType "application/json"
            Write-Host "    [OK] Event sent to backend"
        }
        catch {
            Write-Host "    [ERROR] Failed to send event: $_" -ForegroundColor Red
        }
        Write-Host ""
    } | Out-Null

    Write-Host "    USB monitoring active"
}

# ----------------------------------------------------------
# CLEANUP ON EXIT
# ----------------------------------------------------------
$OnExit = {
    Write-Host ""
    Write-Host "[!] Shutting down agent..."
    
    if ($global:DEVICE_ID) {
        Update-DeviceStatus -status "offline" -security_status "unknown"
    }
    
    try {
        Unregister-Event -SourceIdentifier "USBInsert" -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier "USBRemove" -ErrorAction SilentlyContinue
    } catch {}
    
    Write-Host "[+] Agent stopped"
}
Register-EngineEvent PowerShell.Exiting -Action $OnExit | Out-Null

# ----------------------------------------------------------
# MAIN EXECUTION
# ----------------------------------------------------------
Clear-Host
Write-Host "=========================================================="
Write-Host "  Windows Security Monitoring Agent v3.0"
Write-Host "=========================================================="
Write-Host ""

Initialize-Device

if ($global:DEVICE_ID) {
    Update-DeviceStatus -status "online" -security_status "secure"
    Register-UsbEventHandlers
    
    Write-Host ""
    Write-Host "=========================================================="
    Write-Host "  AGENT RUNNING - Monitoring Active"
    Write-Host "=========================================================="
    Write-Host ""
    Write-Host "[i] Monitoring USB events..."
    Write-Host "[i] Press Ctrl+C to stop"
    Write-Host ""
    Write-Host "Waiting for USB events..."
}
else {
    Write-Host "[-] Device registration failed - cannot continue"
    Write-Host "[i] Check your internet connection and API endpoint"
    exit 1
}

# Keep agent running
while ($true) {
    Start-Sleep -Seconds 10
}
