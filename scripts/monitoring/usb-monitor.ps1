# USB Device Monitoring Script for Windows
# Place in: C:\Program Files (x86)\ossec-agent\active-response\bin\usb-monitor.ps1

$LogFile = "C:\ProgramData\ossec\logs\usb-devices.log"
$DetailLog = "C:\ProgramData\ossec\logs\usb-details.log"

# Create log directory if it doesn't exist
$LogDir = Split-Path $LogFile -Parent
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force
}

function Write-USBLog {
    param(
        [string]$Message,
        [string]$Type = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - [$Type] $Message" | Out-File -FilePath $LogFile -Append
}

function Get-DeviceDetails {
    param($DeviceInfo)
    
    $details = @{
        Name = $DeviceInfo.Name
        DeviceID = $DeviceInfo.DeviceID
        Manufacturer = $DeviceInfo.Manufacturer
        Description = $DeviceInfo.Description
        Status = $DeviceInfo.Status
        PNPClass = $DeviceInfo.PNPClass
        Service = $DeviceInfo.Service
    }
    
    # Get hardware IDs if available
    if ($DeviceInfo.HardwareID) {
        $details.HardwareIDs = $DeviceInfo.HardwareID -join ";"
    }
    
    return $details
}

function Get-DeviceType {
    param($DeviceName)
    
    switch -Regex ($DeviceName) {
        "keyboard|keypad" { return "KEYBOARD" }
        "mouse|pointing" { return "MOUSE" }
        "storage|disk|flash|thumb|usb drive" { return "STORAGE" }
        "webcam|camera" { return "CAMERA" }
        "audio|sound|speaker|microphone" { return "AUDIO" }
        "printer|scanner" { return "PRINTER" }
        "bluetooth" { return "BLUETOOTH" }
        default { return "UNKNOWN" }
    }
}

# Initialize WMI event monitoring
Write-USBLog "USB Monitor Starting..." "INIT"

try {
    # Monitor device arrival
    $QueryArrive = "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBHub'"
    Register-WmiEvent -Query $QueryArrive -Action {
        $device = $Event.SourceEventArgs.NewEvent.TargetInstance
        $deviceInfo = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.DeviceID -eq $device.DeviceID }
        
        if ($deviceInfo) {
            $details = Get-DeviceDetails $deviceInfo
            $type = Get-DeviceType $deviceInfo.Name
            
            $message = "USB_DEVICE_CONNECTED: Type=$type"
            foreach ($key in $details.Keys) {
                $message += " ${key}=$($details[$key])"
            }
            
            Write-USBLog $message "CONNECT"
            
            # Log detailed info to separate file
            $detailJson = $details | ConvertTo-Json
            "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - DEVICE_DETAILS: $detailJson" | 
                Out-File -FilePath $DetailLog -Append
        }
    }

    # Monitor device removal
    $QueryRemove = "SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBHub'"
    Register-WmiEvent -Query $QueryRemove -Action {
        $device = $Event.SourceEventArgs.NewEvent.TargetInstance
        Write-USBLog "USB_DEVICE_REMOVED: DeviceID=$($device.DeviceID)" "REMOVE"
    }

    Write-USBLog "USB Monitor Started Successfully" "INIT"
    
    # Keep script running and handle interrupts
    while ($true) {
        Start-Sleep -Seconds 1
    }
} catch {
    Write-USBLog "Error: $($_.Exception.Message)" "ERROR"
    throw
} finally {
    # Cleanup on exit
    Get-EventSubscriber | Unregister-Event
    Write-USBLog "USB Monitor Stopped" "STOP"
}
