# Unified Policy Test Agent - GUI Version
# Merges Registration, USB Requests, and Live Policy Monitoring into one tool.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# --- Configuration ---
$API_URL_BASE = "http://localhost:3000" # Default, can be changed in GUI
$AGENT_DIR = "$env:APPDATA\CyArtAgent"
$CONFIG_FILE = "$AGENT_DIR\agent.config"
$REG_FILE = "$AGENT_DIR\device_id.txt"

# Create agent dir
if (-not (Test-Path $AGENT_DIR)) { New-Item -ItemType Directory -Path $AGENT_DIR | Out-Null }

# --- Global State ---
$global:DeviceId = ""
$global:OwnerEmail = ""  # User's email for device ownership
$global:IsQuarantined = $false
$global:UsbDataLimit = 0
$global:UsbReadOnly = $false
$global:UsbExpiration = ""
$global:CurrentUsage = 0
$global:PolicyTimer = $null
$global:OfflineMode = $false
$global:UsbDataUsage = @{}  # Tracks data usage per USB serial number: @{ "serial123" = @{ usage_mb = 10.5; drive_letter = "E:"; limit_mb = 100 } }
$global:LastPolicyRefresh = $null  # Tracks when policies were last refreshed
$global:ProcessedReadOnlyDrives = @{} # Track drives that have had RO applied to avoid spam: @{ "E:" = $true }
$global:LastReadOnlyState = $false # Track previous state to detect toggle

# --- Helper Functions ---

function Show-Notification($title, $message, $type = "Info") {
    $icon = [System.Windows.Forms.ToolTipIcon]::Info
    if ($type -eq "Error") { $icon = [System.Windows.Forms.ToolTipIcon]::Error }
    elseif ($type -eq "Warning") { $icon = [System.Windows.Forms.ToolTipIcon]::Warning }
    
    $notifyIcon.ShowBalloonTip(3000, $title, $message, $icon)
}

function Send-Log($logType, $severity, $message, $eventType, $rawData = $null) {
    try {
        $url = $urlBox.Text.TrimEnd("/")
        $logUrl = "$url/api/log"
        
        $logPayload = @{
            device_id     = $global:DeviceId
            device_name   = $env:COMPUTERNAME
            hostname      = $env:COMPUTERNAME
            log_type      = $logType
            hardware_type = "usb"
            event         = $eventType
            source        = "agent"
            severity      = $severity
            message       = $message
            timestamp     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        }
        
        if ($rawData) { $logPayload["raw_data"] = $rawData }

        Invoke-RestMethod -Uri $logUrl -Method Post -Body ($logPayload | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null
    }
    catch { 
        # Log to local console if API fails, but don't crash
        Write-Host "Failed to send log: $($_.Exception.Message)"
    }
}

function Set-GlobalWriteProtect($enable) {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    
    $currentVal = Get-ItemProperty -Path $regPath -Name "WriteProtect" -ErrorAction SilentlyContinue
    $targetVal = if ($enable) { 1 } else { 0 }
    
    if ($currentVal -and $currentVal.WriteProtect -eq $targetVal) {
        return $false # No change needed
    }
    
    Set-ItemProperty -Path $regPath -Name "WriteProtect" -Value $targetVal
    return $true # Changed
}

function Cycle-PnpDevice($instanceId) {
    if ($global:IsQuarantined) {
        Log-Message "[!] SKIPPING Device Cycle: Agent is in Quarantine Block mode."
        return
    }
    
    try {
        Log-Message "[INFO] Refreshing device options (Cycle)..."
        Disable-PnpDevice -InstanceId $instanceId -Confirm:$false -ErrorAction Stop
        Start-Sleep -Milliseconds 2000
        
        # Double check safety before enabling
        if ($global:IsQuarantined) {
            Log-Message "[!] ABORTING Enable: Device became quarantined."
            return
        }
        
        Enable-PnpDevice -InstanceId $instanceId -Confirm:$false -ErrorAction Stop
        Log-Message "[OK] Device refreshed."
    }
    catch {
        Log-Message "[!] Device Cycle Failed: $($_.Exception.Message)"
    }
}



function Log-Message($msg) {
    if ($statusBox.InvokeRequired) {
        $statusBox.Invoke([Action[string]] { param($m) 
                $timestamp = Get-Date -Format "HH:mm:ss"
                $statusBox.AppendText("[$timestamp] $m`r`n")
                $statusBox.ScrollToCaret() 
            }, $msg)
    }
    else {
        $timestamp = Get-Date -Format "HH:mm:ss"
        $statusBox.AppendText("[$timestamp] $msg`r`n")
        $statusBox.ScrollToCaret()
    }
}

function Get-MachineID {
    try {
        (Get-CimInstance -Class Win32_ComputerSystemProduct).UUID.Trim()
    }
    catch { "UNKNOWN-ID" }
}

function Get-RealIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Sort-Object InterfaceIndex | Select-Object -First 1).IPAddress
        if ($ip) { $ip } else { "127.0.0.1" }
    }
    catch { "127.0.0.1" }
}

function Get-RealMAC {
    try {
        $mac = (Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq "Up" -and $_.MacAddress } | Sort-Object InterfaceIndex | Select-Object -First 1).MacAddress
        if ($mac) { $mac } else { "00-00-00-00-00-00" }
    }
    catch { "00-00-00-00-00-00" }
}

function Load-Config {
    if (Test-Path $CONFIG_FILE) {
        $json = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
        if ($json.server_url) { $urlBox.Text = $json.server_url }
        if ($json.owner_email) { 
            $global:OwnerEmail = $json.owner_email
            $emailBox.Text = $json.owner_email
        }
    }
    if (Test-Path $REG_FILE) {
        $global:DeviceId = (Get-Content $REG_FILE -Raw).Trim()
        $idLabel.Text = "Device ID: $global:DeviceId"
        $tabs.SelectedTab = $tabMonitor # Switch to monitor if registered
        Start-Monitoring
    }
}

function Save-Config {
    $config = @{ 
        server_url  = $urlBox.Text
        owner_email = $emailBox.Text
    }
    $config | ConvertTo-Json | Set-Content $CONFIG_FILE
}

function Register-Device($silent = $false) {
    # Validate email is provided
    $ownerEmail = $emailBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($ownerEmail)) {
        if (-not $silent) {
            [System.Windows.Forms.MessageBox]::Show("Please enter your email address before registering.", "Email Required", "OK", "Warning")
        }
        Log-Message "Registration failed: Email address required."
        return
    }
    
    # Basic email validation
    if ($ownerEmail -notmatch "^[^@]+@[^@]+\.[^@]+$") {
        if (-not $silent) {
            [System.Windows.Forms.MessageBox]::Show("Please enter a valid email address.", "Invalid Email", "OK", "Warning")
        }
        Log-Message "Registration failed: Invalid email format."
        return
    }
    
    $global:OwnerEmail = $ownerEmail
    
    if ($global:OfflineMode) {
        $global:DeviceId = "OFFLINE-TEST-" + (Get-Random -Minimum 1000 -Maximum 9999)
        $idLabel.Text = "Device ID: $global:DeviceId"
        Log-Message "Offline Registration Simulated."
        Save-Config
        $tabs.SelectedTab = $tabMonitor
        Start-Monitoring
        return
    }

    $url = $urlBox.Text.TrimEnd("/")
    $apiUrl = "$url/api/devices/register"

    $payload = @{
        device_name   = $env:COMPUTERNAME
        device_type   = "windows"
        owner         = $global:OwnerEmail
        location      = "Localhost Test"
        hostname      = $env:COMPUTERNAME
        ip_address    = (Get-RealIP)
        mac_address   = (Get-RealMAC)
        os_version    = (Get-CimInstance Win32_OperatingSystem).Caption
        agent_version = "3.0.0-GUI-TEST"
    }

    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body ($payload | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
        
        if ($response.device_id) {
            $global:DeviceId = $response.device_id.ToString().Trim()
            $global:DeviceId | Set-Content $REG_FILE
            
            $idLabel.Text = "Device ID: $global:DeviceId"
            Log-Message "Registration Successful!"
            
            if ($silent) {
                $notifyIcon.ShowBalloonTip(3000, "CyArt Agent", "Device Registered: $global:DeviceId", [System.Windows.Forms.ToolTipIcon]::Info)
            }

            # Log registration event
            Send-Log "system" "info" "Device registered successfully: $env:COMPUTERNAME" "registered"

            Save-Config
            $tabs.SelectedTab = $tabMonitor
            Start-Monitoring
        }
        else {
            Log-Message "Registration failed: No ID returned."
        }
    }
    catch {
        Log-Message "Error registering: $($_.Exception.Message)"
        if (-not $silent) {
            [System.Windows.Forms.MessageBox]::Show("Failed to register. Check Server URL.", "Error", "OK", "Error")
        }
        else {
            $notifyIcon.ShowBalloonTip(3000, "CyArt Agent", "Registration Failed: $($_.Exception.Message)", [System.Windows.Forms.ToolTipIcon]::Error)
        }
    }
}

function Check-Policies {
    if ([string]::IsNullOrEmpty($global:DeviceId)) { return }
    
    $url = $urlBox.Text.TrimEnd("/")
    $statusUrl = "$url/api/devices/quarantine/status?device_id=$($global:DeviceId)"

    try {
        if ($global:OfflineMode) {
            # Read from Offline Controls
            $status = @{
                usb_data_limit_mb   = if ($txtOfflineLimit.Text) { [double]$txtOfflineLimit.Text } else { 0 }
                usb_read_only       = $chkOfflineRO.Checked
                usb_expiration_date = $null
            }
        }
        else {
            $status = Invoke-RestMethod -Uri $statusUrl -Method Get -TimeoutSec 5 -ErrorAction Stop
        }
        
        # Update UI
        $lblLimit.Text = "Data Limit: $(if ($status.usb_data_limit_mb) { "$($status.usb_data_limit_mb) MB" } else { "None" })"
        $lblReadOnly.Text = "Read Only: $(if ($status.usb_read_only) { "YES" } else { "No" })"
        $lblExpires.Text = "Expires: $(if ($status.usb_expiration_date) { $status.usb_expiration_date } else { "Never" })"
        
        $global:UsbDataLimit = if ($status.usb_data_limit_mb) { [double]$status.usb_data_limit_mb } else { 0 }
        $global:UsbReadOnly = [bool]$status.usb_read_only
        
        if ($global:UsbReadOnly) {
            $global:LastReadOnlyState = $true
            $lblEnforcement.Text = "Enforcement: READ ONLY (ACLs Applied)"
            $lblEnforcement.ForeColor = [System.Drawing.Color]::Orange
            
            # Apply to all found removable drives
            try {
                $usbDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
                foreach ($disk in $usbDrives) {
                    if (-not $global:ProcessedReadOnlyDrives.ContainsKey($disk.DeviceID)) {
                        $result = Set-DriveReadOnly $disk.DeviceID "POLICY-REFRESH"
                        if ($result.Success) {
                            $global:ProcessedReadOnlyDrives[$disk.DeviceID] = $true # Mark as done
                            # We don't spam notifications on timer refresh, only logs if needed, but here we assume initial connection handled it.
                        }
                    }
                }
            }
            catch {}
        }
        else {
            # POLICY UPDATE: Read-Only is FALSE
            if ($global:LastReadOnlyState) {
                # Transitioned from RO -> Normal
                $global:LastReadOnlyState = $false
                
                # 1. Disable Global Registry WriteProtect
                Set-GlobalWriteProtect $false
                Log-Message "[INFO] Policy Normal: Global WriteProtect disabled."
                
                # 2. Clear ACLs from all drives (Best Effort)
                try {
                    $usbDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
                    foreach ($disk in $usbDrives) {
                        try {
                            $path = "$($disk.DeviceID)\"
                            $acl = Get-Acl -Path $path
                            # Remove all Deny rules we might have added
                            $rulesToRemove = $acl.Access | Where-Object { $_.AccessControlType -eq "Deny" -and $_.IdentityReference -match "Authenticated Users" }
                            if ($rulesToRemove) {
                                foreach ($rule in $rulesToRemove) {
                                    $acl.RemoveAccessRule($rule) | Out-Null
                                }
                                Set-Acl -Path $path -AclObject $acl -ErrorAction SilentlyContinue
                                Log-Message "[OK] Removed Read-Only ACL from $($disk.DeviceID)"
                            }
                        }
                        catch {}
                    }
                }
                catch {}

                Show-Notification "Write-Protect Removed" "Policy set to Normal. Re-plug USB to write."
            }
            
            # Reset UI
            $lblEnforcement.Text = "Enforcement: Normal"
            $lblEnforcement.ForeColor = [System.Drawing.Color]::Green
            
            # Clear processed tracker so we can re-apply if policy flips back
            $global:ProcessedReadOnlyDrives.Clear()
        }

        # Data Limit Simulation
        if ($global:UsbDataLimit -gt 0) {
            # 1. Identify Removable (USB) Drives
            $usbDrives = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -ExpandProperty DeviceID
            
            # 2. Track Usage only if USB drives exist
            $usage = 0
            if ($usbDrives) {
                try {
                    $samples = Get-Counter -Counter "\LogicalDisk(*)\Disk Write Bytes/sec" -MaxSamples 1 -ErrorAction SilentlyContinue
                    if ($samples) {
                        # Filter for only our USB drives
                        $cooked = $samples.CounterSamples | Where-Object { $usbDrives -contains $_.InstanceName } | Measure-Object -Property CookedValue -Sum
                        $usage = $cooked.Sum / 1024 / 1024 # MB/s
                    }
                }
                catch {}
            }
            
            # Accumulate approximate usage (assuming 2s interval)
            # Only accumulate if we are NOT quarantined
            if (-not $global:IsQuarantined) {
                $global:CurrentUsage += ($usage * 2) 
            }
            
            $progBar.Value = [Math]::Min(100, [int](($global:CurrentUsage / $global:UsbDataLimit) * 100))
            $lblUsage.Text = "Current Usage: $([Math]::Round($global:CurrentUsage, 2)) MB"
            
            if ($global:CurrentUsage -gt $global:UsbDataLimit) {
                $lblEnforcement.Text = "Enforcement: DATA LIMIT EXCEEDED - BLOCKED"
                $lblEnforcement.ForeColor = [System.Drawing.Color]::Red
                if (-not $global:IsQuarantined) {
                    Log-Message "CRITICAL: Data Limit Exceeded! Blocking USB."
                    $global:IsQuarantined = $true
                    
                    # Force Disable All USBs immediately
                    try {
                        $usbDevices = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "^USB" -and $_.Class -eq "DiskDrive" }
                        foreach ($dev in $usbDevices) {
                            Disable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
                            Log-Message "[ISOLATION] Blocked device: $($dev.InstanceId)"
                        }
                    }
                    catch {}
                }
            }

        }
        
        # Legacy Data Limit Check Removed (Moved to DataTimer)


        # Refresh policies for connected USB devices (every 30 seconds)
        if (-not $global:LastPolicyRefresh -or ((Get-Date) - $global:LastPolicyRefresh).TotalSeconds -gt 30) {
            $global:LastPolicyRefresh = Get-Date
            
            foreach ($serial in @($global:UsbDataUsage.Keys)) {
                try {
                    $url = $urlBox.Text.TrimEnd("/")
                    $checkUrl = "$url/api/usb/check?serial_number=$serial&computer_name=$env:COMPUTERNAME"
                    $response = Invoke-RestMethod -Uri $checkUrl -Method Get -ErrorAction Stop
                    
                    if ($response.authorized -and $response.device) {
                        $deviceData = $global:UsbDataUsage[$serial]
                        $newLimit = $response.device.max_daily_transfer_mb
                        
                        # Check if limit changed
                        if ($newLimit -and $newLimit -ne $deviceData.limit_mb) {
                            $oldLimit = $deviceData.limit_mb
                            $deviceData.limit_mb = $newLimit
                            Log-Message "POLICY UPDATE: Data limit changed from $oldLimit MB to $newLimit MB for device $serial"
                            
                            # Log policy change to API
                            $logUrl = "$url/api/log"
                            $logPayload = @{
                                device_id     = $global:DeviceId
                                device_name   = $env:COMPUTERNAME
                                hostname      = $env:COMPUTERNAME
                                log_type      = "usb"
                                hardware_type = "usb"
                                event         = "policy_updated"
                                source        = "usb-monitor"
                                severity      = "info"
                                message       = "USB policy updated: Data limit changed from $oldLimit MB to $newLimit MB"
                                timestamp     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                                raw_data      = @{
                                    serial_number = $serial
                                    old_limit_mb  = $oldLimit
                                    new_limit_mb  = $newLimit
                                }
                            }
                            Invoke-RestMethod -Uri $logUrl -Method Post -Body ($logPayload | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
                        }

                        # Check if Read-Only changed
                        $isRO = [bool]$response.device.is_read_only

                        # CRITICAL FIX: If Data Limit exceeded locally, FORCE Read-Only override
                        # This prevents the server (which sees 'false') from resetting our local Soft Block
                        if ($deviceData.limit_mb -and $deviceData.usage_mb -ge $deviceData.limit_mb) {
                            $isRO = $true
                        }
                        
                        # Update the tracking object so the Data Limit loop knows the current state
                        $deviceData.is_read_only = $isRO
                        
                        if ($isRO) {
                            if (-not $global:ProcessedReadOnlyDrives.ContainsKey($deviceData.drive_letter)) {
                                Log-Message "POLICY UPDATE: Enabling Read-Only for $serial"
                                $result = Set-DriveReadOnly $deviceData.drive_letter $serial
                                if ($result.Success) {
                                    $global:ProcessedReadOnlyDrives[$deviceData.drive_letter] = $true
                                }
                            }
                        }
                        else {
                            # Policy says NOT Read-Only. If we previously enforced it, we should try to remove it.
                            if ($global:ProcessedReadOnlyDrives.ContainsKey($deviceData.drive_letter)) {
                                Log-Message "POLICY UPDATE: Disabling Read-Only for $serial"
                                 
                                # Remove ACLs logic
                                try {
                                    $path = "$($deviceData.drive_letter)\"
                                    $acl = Get-Acl -Path $path
                                    $rulesToRemove = $acl.Access | Where-Object { $_.AccessControlType -eq "Deny" -and $_.IdentityReference -match "Authenticated Users" }
                                    if ($rulesToRemove) {
                                        foreach ($rule in $rulesToRemove) { $acl.RemoveAccessRule($rule) | Out-Null }
                                        Set-Acl -Path $path -AclObject $acl -ErrorAction SilentlyContinue
                                        Log-Message "[OK] Removed Read-Only ACL from $($deviceData.drive_letter)"
                                    }
                                }
                                catch {}
                                 
                                # If it was Registry based, we rely on Global cycle check, or...
                                # We can't easily revert partial registry without toggling global, 
                                # so we assume global loop handles registry.
                                 
                                $global:ProcessedReadOnlyDrives.Remove($deviceData.drive_letter)
                            }
                        }
                    }
                    elseif (-not $response.authorized) {
                        # Device was revoked from dashboard - block it immediately
                        Log-Message "DEVICE REVOKED: Device $serial was blocked from dashboard - Disabling now"
                        
                        try {
                            # Find and disable the device
                            $usbDevices = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "^USB" }
                            foreach ($dev in $usbDevices) {
                                if ($dev.InstanceId -match $serial) {
                                    Log-Message "[DEBUG] Attempting to disable (Revoked): $($dev.InstanceId)"
                                    Disable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction Stop
                                    Log-Message "Device disabled - Authorization revoked by administrator"
                                    
                                    # Verify
                                    Start-Sleep -Milliseconds 200
                                    $checkDev = Get-PnpDevice -InstanceId $dev.InstanceId
                                    if ($checkDev.Status -eq "Error" -or $checkDev.Status -eq "Unknown" -or $checkDev.Problem -ne "CM_PROB_NONE") {
                                        Log-Message "[OK] Disable confirmed."
                                    }
                                    else {
                                        Log-Message "[?] Warning: Device status is still $($checkDev.Status)"
                                    }
                                    
                                    # Log revocation to API
                                    $logUrl = "$url/api/log"
                                    $logPayload = @{
                                        device_id     = $global:DeviceId
                                        device_name   = $env:COMPUTERNAME
                                        hostname      = $env:COMPUTERNAME
                                        log_type      = "security"
                                        hardware_type = "usb"
                                        event         = "blocked"
                                        source        = "usb-monitor"
                                        severity      = "warning"
                                        message       = "USB device remotely revoked and blocked: Serial $serial"
                                        timestamp     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                                        raw_data      = @{
                                            serial_number    = $serial
                                            revoked_remotely = $true
                                        }
                                    }
                                    Invoke-RestMethod -Uri $logUrl -Method Post -Body ($logPayload | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
                                    
                                    # Remove from tracking
                                    $global:UsbDataUsage.Remove($serial)
                                    break
                                }
                            }
                        }
                        catch {
                            Log-Message "Failed to disable revoked device: $($_.Exception.Message)"
                        }
                    }
                }
                catch { }
            }
        }

    }
    catch {
        Log-Message "Policy Check Failed: $($_.Exception.Message)"
    }
}

function Start-Monitoring {
    if ($global:PolicyTimer) { return }
    Log-Message "Starting Real-Time Policy Monitor..."
    
    # Add concurrency guard
    $global:PolicyCheckRunning = $false
    
    $global:PolicyTimer = New-Object System.Windows.Forms.Timer
    $global:PolicyTimer.Interval = 5000 # 5 seconds (increased from 2 to reduce load)
    $global:PolicyTimer.Add_Tick({
            # Prevent concurrent executions
            if (-not $global:PolicyCheckRunning) {
                $global:PolicyCheckRunning = $true
                try {
                    Check-Policies
                }
                finally {
                    $global:PolicyCheckRunning = $false
                }
            }
        })
    $global:PolicyTimer.Start()
    
    # --- NEW: Dedicated High-Speed Data Timer (1s) ---
    # This runs separately to check usage fast without freezing usage or spamming API
    if ($global:DataTimer) { $global:DataTimer.Stop(); $global:DataTimer.Dispose() }
    
    $global:DataTimer = New-Object System.Windows.Forms.Timer
    $global:DataTimer.Interval = 50 # 50ms check (Ultra Fast)
    $global:DataTimer.Add_Tick({
            # Lightweight check: Only Performance Counters
            if ($global:UsbDataUsage.Count -gt 0) {
                foreach ($serial in @($global:UsbDataUsage.Keys)) {
                    $deviceData = $global:UsbDataUsage[$serial]
                
                    # SKIP if Read-Only (Safety/Optimization)
                    if ($deviceData.is_read_only) { continue }
                
                    if ($deviceData.limit_mb -and $deviceData.drive_letter) {
                        # Check usage with 0.2s interval math
                        $usageCheck = Track-USBDataUsage $serial $deviceData.drive_letter $deviceData.limit_mb 0.2
                    
                        if ($usageCheck.exceeded) {
                            # SOFT BLOCK: Switch to Read-Only
                            Log-Message "DATA LIMIT EXCEEDED: $($usageCheck.usage) MB / $($usageCheck.limit) MB - Enforcing Read-Only Mode..."
                             
                            try {
                                # Try Soft Block First
                                $roResult = Set-DriveReadOnly $deviceData.drive_letter $serial
                                  
                                if ($roResult.Success) {
                                    Log-Message "[OK] Soft Block Applied: Device is now Read-Only."
                                    Show-Notification "Data Limit Exceeded" "USB Device set to Read-Only (Limit: $($usageCheck.limit) MB)." "Warning"
                                      
                                    # UPDATE STATE: Stop tracking data for this device
                                    $deviceData.is_read_only = $true
                                    $global:ProcessedReadOnlyDrives[$deviceData.drive_letter] = $true
                                      
                                    # Log event via Background Job to prevent main thread lag
                                    $logPayload = @{
                                        device_id = $global:DeviceId
                                        hostname  = $env:COMPUTERNAME
                                        log_type  = "security"
                                        event     = "soft_blocked"
                                        severity  = "warning"
                                        message   = "Data Limit Exceeded: Switched to Read-Only mode."
                                        raw_data  = @{ serial = $serial; usage = $usageCheck.usage }
                                        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                                    }
                                    Start-Job -ScriptBlock { param($u, $p) Invoke-RestMethod -Uri "$u/api/log" -Method Post -Body ($p | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue } -ArgumentList ($urlBox.Text.TrimEnd("/")), $logPayload | Out-Null
                                }
                                else {
                                    throw "Read-Only application failed: $($roResult.Reason)"
                                }
                            } 
                            catch {
                                Log-Message "[!] Soft Block Failed ($($_.Exception.Message)). Fallback to HARD BLOCK."
                                  
                                # FALLBACK: Disable Device
                                try {
                                    Disable-PnpDevice -InstanceId $serial -Confirm:$false -ErrorAction SilentlyContinue
                                    # Redundant check for PNP ID variations
                                    $usbDevices = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "^USB" }
                                    foreach ($d in $usbDevices) {
                                        if ($d.InstanceId -match $serial) {
                                            Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
                                        }
                                    }
                                    $global:UsbDataUsage.Remove($serial)
                                    Show-Notification "Data Limit Exceeded" "USB Device blocked (Read-Only failed)." "Error"
                                }
                                catch {}
                            }
                        }
                    }
                }
            }
        })
    $global:DataTimer.Start()
    
    Start-USBMonitoring
}

function Test-USBPolicies($policies) {
    $now = Get-Date
    
    # Check expiration date
    if ($policies.expiration_date) {
        $expiration = [DateTime]::Parse($policies.expiration_date)
        if ($now -gt $expiration) {
            return @{ valid = $false; reason = "Device expired on $($expiration.ToString('yyyy-MM-dd'))" }
        }
    }
    
    # Check time restrictions
    if ($policies.allowed_start_time -and $policies.allowed_end_time) {
        $currentTime = $now.ToString("HH:mm")
        if ($currentTime -lt $policies.allowed_start_time -or $currentTime -gt $policies.allowed_end_time) {
            return @{ valid = $false; reason = "Access only allowed between $($policies.allowed_start_time) and $($policies.allowed_end_time)" }
        }
    }
    
    return @{ valid = $true; reason = "" }
}

function Track-USBDataUsage($serialNumber, $driveLetter, $limitMB, $intervalSeconds = 1.0) {
    try {
        $driveName = $driveLetter.Trim('\')
        
        # Initialize PerformanceCounter if not cached OR if missing in existing object
        # (Register-USBDevice creates the object without perf_counter, so we must check property existence)
        $needsInit = (-not $global:UsbDataUsage.ContainsKey($serialNumber)) -or (-not $global:UsbDataUsage[$serialNumber].perf_counter)
        
        if ($needsInit) {
            try {
                # Create PerformanceCounter for "Disk Write Bytes/sec" (Rate)
                # But we will read .RawValue (Cumulative Bytes)
                $pc = New-Object System.Diagnostics.PerformanceCounter("LogicalDisk", "Disk Write Bytes/sec", $driveName)
                
                # Force initial read
                $startBytes = $pc.RawValue
                
                if (-not $global:UsbDataUsage.ContainsKey($serialNumber)) {
                    $global:UsbDataUsage[$serialNumber] = @{}
                }
                
                # Update/Upsert the counter data
                $global:UsbDataUsage[$serialNumber].usage_mb = 0
                $global:UsbDataUsage[$serialNumber].drive_letter = $driveLetter
                $global:UsbDataUsage[$serialNumber].limit_mb = $limitMB
                $global:UsbDataUsage[$serialNumber].start_bytes = $startBytes
                $global:UsbDataUsage[$serialNumber].perf_counter = $pc
                
                Log-Message "[DEBUG] Init Counter for $driveLetter Success. Start: $startBytes"
            }
            catch { 
                # Fallback/Error handling (e.g. Instance not found)
                Log-Message "[ERROR] Failed to init counter: $($_.Exception.Message)"
                return @{ exceeded = $false; usage = 0; limit = $limitMB } 
            }
        }

        # Get device tracking data
        $deviceData = $global:UsbDataUsage[$serialNumber]
        $pc = $deviceData.perf_counter
        
        if ($pc) {
            # Read Cumulative Bytes directly from Kernel (Fast & Unbuffered)
            $currentBytes = $pc.RawValue
            $startBytes = $deviceData.start_bytes
            
            # Calculate Usage (Current - Start)
            # Handle Counter Rollover (rare for 64-bit, but good practice)? No, 64-bit is huge.
            if ($currentBytes -lt $startBytes) {
                # Reboot or counter reset? Reset baseline.
                $deviceData.start_bytes = $currentBytes
                $deviceData.usage_mb = 0
            }
            else {
                $totalBytes = $currentBytes - $startBytes
                $deviceData.usage_mb = [math]::Round($totalBytes / 1MB, 2)
            }
            
            # Check if limit exceeded
            if ($deviceData.usage_mb -ge $limitMB) {
                return @{ exceeded = $true; usage = $deviceData.usage_mb; limit = $limitMB }
            }
        }
    }
    catch {
        Log-Message "[ERROR] Tracking Failed: $($_.Exception.Message)"
    }
    
    # Return current usage (safe default)
    $safeUsage = if ($global:UsbDataUsage[$serialNumber]) { $global:UsbDataUsage[$serialNumber].usage_mb } else { 0 }
    return @{ exceeded = $false; usage = $safeUsage; limit = $limitMB }
}

function Set-DriveReadOnly($driveLetter, $serialNumber = "UNKNOWN") {
    try {
        $path = "$($driveLetter)\"
        if (-not (Test-Path $path)) { return @{ Success = $false; Reason = "Path not found" } }
        
        # Check if already processed to avoid spam (optional, but good for idempotent checks)
        # However, we might want to re-apply if it was removed, so we'll just proceed.
        
        Log-Message "[INFO] Enforcing Read-Only on $path (ACLs)..."
        
        # 1. Get current ACL
        $acl = Get-Acl -Path $path
        
        # 2. Check FileSystem to ensure it's not FAT32 (heuristic: FAT32 often fails Set-Acl or doesn't persist properly)
        $volume = Get-CimInstance -ClassName Win32_Volume | Where-Object { $_.DriveLetter -eq $driveLetter }
        
        if ($volume.FileSystem -match "FAT" -or $volume.FileSystem -match "exFAT") {
            Log-Message "[INFO] FAT/exFAT detected on $driveLetter. Using Registry WriteProtect..."
             
            # 1. Set Registry Key
            $wasChanged = Set-GlobalWriteProtect $true
             
            # 2. Cycle Device to apply ONLY if state changed (Fixes infinite refresh loop)
            if ($wasChanged -and $serialNumber -ne "UNKNOWN") {
                Log-Message "[INFO] WriteProtect state toggled. Refreshing device..."
                $dev = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match $serialNumber -and $_.Class -eq "DiskDrive" }
                if ($dev) {
                    Cycle-PnpDevice $dev.InstanceId
                }
                else {
                    # Try generic USB container
                    $dev = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match $serialNumber } | Select-Object -First 1
                    if ($dev) { Cycle-PnpDevice $dev.InstanceId }
                }
            }
            elseif (-not $wasChanged) {
                Log-Message "[DEBUG] Global WriteProtect already active. Skipping refresh cycle."
            }
             
            return @{ Success = $true; Reason = "Global Registry WriteProtect Applied (FAT32 Compatible)"; Type = "Registry" }
        }

        # 3. Create "Deny Write" rule for "Authenticated Users"
        # Rights: Write, AppendData, WriteAttributes, WriteExtendedAttributes, Delete, DeleteSubdirectoriesAndFiles
        $rights = [System.Security.AccessControl.FileSystemRights]"Write, AppendData, Delete, DeleteSubdirectoriesAndFiles"
        $type = [System.Security.AccessControl.AccessControlType]::Deny
        $user = New-Object System.Security.Principal.SecurityIdentifier([System.Security.Principal.WellKnownSidType]::AuthenticatedUserSid, $null)
        
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, $rights, $type)
        
        # 4. Add rule
        $acl.AddAccessRule($rule)
        
        # 5. Apply
        Set-Acl -Path $path -AclObject $acl -ErrorAction Stop
        
        Log-Message "[OK] Read-Only Applied to $driveLetter"
        return @{ Success = $true; Reason = "Read-Only ACLs applied successfully"; Type = "NTFS" }
    }
    catch {
        $msg = $_.Exception.Message
        Log-Message "[!] Read-Only Failed: $msg"
        return @{ Success = $false; Reason = $msg; Type = "Error" }
    }
}

# --- USB Monitoring (Arrival/Removal) ---
function Start-USBMonitoring {
    Log-Message "Starting USB Event Monitor..."
    try {
        # USB Arrival Watcher
        $global:UsbArrivalWatcher = New-Object System.Management.ManagementEventWatcher
        $global:UsbArrivalWatcher.Query = New-Object System.Management.WqlEventQuery("SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.PNPDeviceID LIKE 'USB%'")
        Register-ObjectEvent -InputObject $global:UsbArrivalWatcher -EventName EventArrived -Action {
            $device = $Event.SourceEventArgs.NewEvent.TargetInstance
            $name = $device.Name
            $pnpId = $device.PNPDeviceID
            
            if ($name -and $pnpId) {
                # Extract serial number
                $serialNumber = "UNKNOWN"
                if ($pnpId -match "\\([^\\]+)$") {
                    $serialNumber = $matches[1].Split('&')[0]
                }
                
                $statusBox.Invoke([Action] { 
                        $timestamp = Get-Date -Format "HH:mm:ss"
                        $statusBox.AppendText("[$timestamp] USB CONNECTED: $name`r`n")
                    
                        # OPTIMIZATION: Ignore generic "Mass Storage Device" containers immediately.
                        # These are just parent hubs; we wait for the actual Child Disk to appear for enforcement.
                        if ($name -eq "USB Mass Storage Device") {
                            $statusBox.AppendText("[$timestamp] [INFO] Ignoring Generic Parent Device (Pass-through)`r`n")
                            return
                        }

                        $isAuthorized = $false
                        $devicePolicy = $null

                        # 1. Check whitelist via API
                        try {
                            $url = $urlBox.Text.TrimEnd("/")
                            $encodedName = [uri]::EscapeDataString($name)
                            $checkUrl = "$url/api/usb/check?serial_number=$serialNumber&computer_name=$env:COMPUTERNAME&device_name=$encodedName"
                            $response = Invoke-RestMethod -Uri $checkUrl -Method Get -TimeoutSec 5 -ErrorAction Stop
                        
                            if ($response.authorized) {
                                $isAuthorized = $true
                                $devicePolicy = $response.device
                            }
                        }
                        catch {
                            $statusBox.AppendText("[$timestamp] [!] Unable to verify whitelist status: $($_.Exception.Message)`r`n")
                            # Decide: Block on error? Or Fail Open? Defaulting to Block for security.
                            # But if offline mode is needed, this logic needs "OfflineMode" check.
                        }

                        if ($isAuthorized) {
                            # 2. Validate policies
                            $policyCheck = Test-USBPolicies $devicePolicy
                        
                            if (-not $policyCheck.valid) {
                                # Policy violation
                                $statusBox.AppendText("[$timestamp] [X] POLICY VIOLATION: $($policyCheck.reason)`r`n")
                                $statusBox.ForeColor = [System.Drawing.Color]::Red
                            
                                # Block device
                                try {
                                    Disable-PnpDevice -InstanceId $pnpId -Confirm:$false -ErrorAction Stop
                                    $statusBox.AppendText("[$timestamp] [OK] DEVICE DISABLED: Policy violation`r`n")
                                }
                                catch {
                                    $statusBox.AppendText("[$timestamp] [!] BLOCK FAILED: $($_.Exception.Message)`r`n")
                                }
                            
                                # Log policy violation
                                Send-Log "security" "warning" "USB policy violation: $name - $($policyCheck.reason)" "connected" @{ serial_number = $serialNumber; device_name = $name; authorized = $true; policy_violation = $policyCheck.reason }
                            }
                            else {
                                # 3. Device Authorized & Valid
                                $statusBox.AppendText("[$timestamp] [OK] AUTHORIZED: Device is whitelisted`r`n")
                                $statusBox.ForeColor = [System.Drawing.Color]::Green
                            
                                # Check for read-only policy
                                if ($devicePolicy.is_read_only) {
                                    $statusBox.AppendText("[$timestamp] [!] READ-ONLY MODE: Enforcing Read-Only restrictions...`r`n")
                                    
                                    # Find drive immediately to apply policy
                                    Start-Sleep -Milliseconds 1500 # Wait for mount
                                    
                                    try {
                                        # Heuristic: Get all removable drives
                                        $removableDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
                                        # Simple assumption: The new drive is likely one of these. 
                                        # Ideally match Volume Name or Size, but for now we apply to all removable if policy says so, or guess.
                                        # Better: Iterate all and apply if not applied?
                                        
                                        $targetDrive = $null
                                        if ($removableDrives) {
                                            if ($removableDrives -is [array]) { $targetDrive = $removableDrives[0].DeviceID }
                                            else { $targetDrive = $removableDrives.DeviceID }
                                        }
                                        
                                        if ($targetDrive) {
                                            $result = Set-DriveReadOnly $targetDrive $serialNumber
                                            
                                            if ($result.Success) {
                                                Show-Notification "Device Read-Only" "Drive $targetDrive is now Read-Only per policy."
                                                $global:ProcessedReadOnlyDrives[$targetDrive] = $true
                                                
                                                # Log success
                                                Send-Log "security" "info" "Read-Only permissions applied to drive $targetDrive" "policy_enforcement" @{ serial_number = $serialNumber; drive = $targetDrive }
                                            }
                                            else {
                                                if ($result.Type -eq "FAT32") {
                                                    Show-Notification "Read-Only Failed" "Drive $targetDrive is FAT32. Cannot enforce Read-Only." "Error"
                                                    Send-Log "security" "warning" "Failed to apply Read-Only: FAT32 FileSystem not supported on $targetDrive" "policy_failure" @{ serial_number = $serialNumber; drive = $targetDrive; reason = "FAT32" }
                                                }
                                                else {
                                                    Show-Notification "Read-Only Failed" "Could not set Read-Only on $targetDrive." "Error"
                                                    Send-Log "security" "error" "Failed to apply Read-Only on $targetDrive - $($result.Reason)" "policy_failure" @{ serial_number = $serialNumber; drive = $targetDrive; reason = $result.Reason }
                                                }
                                            }
                                        }
                                    }
                                    catch {
                                        Log-Message "[-] Error applying immediate Read-Only: $($_.Exception.Message)"
                                    }
                                }
                            
                                # Check for data limit
                                if ($devicePolicy.max_daily_transfer_mb) {
                                    $statusBox.AppendText("[$timestamp] [INFO] Data limit: $($devicePolicy.max_daily_transfer_mb) MB/day - Tracking enabled`r`n")
                                
                                    # Find the drive letter asynchronously or with delay
                                    # We use a separate thread or timer check usually, but here we delay briefly
                                    Start-Sleep -Milliseconds 1000
                                    
                                    try {
                                        # Heuristic: Find newest drive or map by size/name if possible. 
                                        # Ideally we map PNPID to Drive Letter, but that's complex in PS.
                                        # Simple fallback: Get all removable drives.
                                        $removableDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
                                        $driveLetter = $null
                                        
                                        if ($removableDrives) {
                                            if ($removableDrives -is [array]) {
                                                $driveLetter = $removableDrives[0].DeviceID # Pic first one
                                            }
                                            else {
                                                $driveLetter = $removableDrives.DeviceID
                                            }
                                        }

                                        if ($driveLetter) {
                                            $global:UsbDataUsage[$serialNumber] = @{
                                                usage_mb     = 0
                                                drive_letter = $driveLetter
                                                limit_mb     = $devicePolicy.max_daily_transfer_mb
                                                is_read_only = $devicePolicy.is_read_only
                                                last_check   = Get-Date
                                            }
                                            $statusBox.AppendText("[$timestamp] [INFO] Monitoring drive $driveLetter for data usage`r`n")
                                        }
                                        else {
                                            $statusBox.AppendText("[$timestamp] [!] Drive letter not found for tracking`r`n")
                                        }
                                    }
                                    catch {
                                        $statusBox.AppendText("[$timestamp] [!] Error finding drive: $($_.Exception.Message)`r`n")
                                    }
                                }
                        
                                # Log authorized connection (Fire and forget)
                                Send-Log "usb" "info" "Authorized USB device connected: $name (Serial: $serialNumber)" "connected" @{ serial_number = $serialNumber; device_name = $name; authorized = $true }
                            }
                        }
                        else {
                            # 4. Unauthorized
                            $statusBox.AppendText("[$timestamp] [X] UNAUTHORIZED: Device NOT whitelisted.`r`n")
                            $statusBox.ForeColor = [System.Drawing.Color]::Red
                        
                            # PHYSICALLY BLOCK THE DEVICE
                            try {
                                $statusBox.AppendText("[$timestamp] [DEBUG] Attempting to disable ID: $pnpId`r`n")
                                
                                # Verify device exists first
                                $targetDev = Get-PnpDevice -InstanceId $pnpId -ErrorAction SilentlyContinue
                                if ($targetDev) {
                                    Disable-PnpDevice -InstanceId $pnpId -Confirm:$false -ErrorAction Stop
                                    
                                    # Verify status change
                                    Start-Sleep -Milliseconds 500
                                    $checkDev = Get-PnpDevice -InstanceId $pnpId
                                    if ($checkDev.Status -eq "Error" -or $checkDev.Status -eq "Unknown" -or $checkDev.Problem -ne "CM_PROB_NONE") {
                                        # Status 'Error' often means disabled in PnpDevice terms if manual disable
                                        $statusBox.AppendText("[$timestamp] [OK] DEVICE DISABLED SUCCESSFULLY.`r`n")
                                    }
                                    else {
                                        $statusBox.AppendText("[$timestamp] [?] Device state: $($checkDev.Status) (Problem: $($checkDev.Problem))`r`n")
                                    }
                                }
                                else {
                                    $statusBox.AppendText("[$timestamp] [!] Device ID not found via Get-PnpDevice`r`n")
                                }
                            }
                            catch {
                                $statusBox.AppendText("[$timestamp] [!] BLOCK FAILED: $($_.Exception.Message)`r`n")
                                $statusBox.AppendText("[$timestamp] [!] Ensure Agent is running as ADMINISTRATOR.`r`n")
                            }
                        
                            # Log security event
                            Send-Log "security" "critical" "BLOCKED unauthorized USB device: $name (Serial: $serialNumber)" "connected" @{ serial_number = $serialNumber; device_name = $name; authorized = $false; blocked = $true }
                        }
                    
                        $statusBox.ScrollToCaret()
                    })
            }
        } | Out-Null
        $global:UsbArrivalWatcher.Start()
        
        # USB Removal Watcher
        $global:UsbRemovalWatcher = New-Object System.Management.ManagementEventWatcher
        $global:UsbRemovalWatcher.Query = New-Object System.Management.WqlEventQuery("SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.PNPDeviceID LIKE 'USB%'")
        Register-ObjectEvent -InputObject $global:UsbRemovalWatcher -EventName EventArrived -Action {
            $device = $Event.SourceEventArgs.NewEvent.TargetInstance
            $name = $device.Name
            $pnpId = $device.PNPDeviceID
            
            if ($name) {
                # Extract serial number
                $serialNumber = "UNKNOWN"
                if ($pnpId -match "\\([^\\]+)$") {
                    $serialNumber = $matches[1].Split('&')[0]
                }
                
                $statusBox.Invoke([Action] { 
                        $timestamp = Get-Date -Format "HH:mm:ss"
                        $statusBox.AppendText("[$timestamp] USB DISCONNECTED: $name`r`n")
                    
                        # Log disconnection to API
                        Send-Log "usb" "info" "USB device disconnected: $name (Serial: $serialNumber)" "disconnected" @{ serial_number = $serialNumber; device_name = $name }
                    
                        $statusBox.ScrollToCaret()
                    })
            }
        } | Out-Null
        $global:UsbRemovalWatcher.Start()
        
        Log-Message "USB Event Monitor Active."
    }
    catch {
        Log-Message "WARNING: USB monitoring failed: $($_.Exception.Message)"
    }
}

function Load-USBDevices {
    $usbGrid.Rows.Clear()
    Log-Message "Scanning for USB devices..."
    try {
        $usbDevices = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "^USB" -and $_.FriendlyName }
        if ($usbDevices.Count -eq 0) {
            Log-Message "No USB devices found."
            return
        }
        foreach ($dev in $usbDevices) {
            $row = $usbGrid.Rows.Add()
            $usbGrid.Rows[$row].Cells["DeviceName"].Value = $dev.FriendlyName
            $usbGrid.Rows[$row].Cells["DeviceClass"].Value = $dev.Class
            $usbGrid.Rows[$row].Cells["DeviceStatus"].Value = $dev.Status
            $usbGrid.Rows[$row].Tag = $dev
        }
        Log-Message "Found $($usbDevices.Count) USB device(s)."
    }
    catch {
        Log-Message "ERROR scanning USB: $($_.Exception.Message)"
    }
}

function Submit-USBRequest {
    if ($usbGrid.SelectedRows.Count -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Please select a USB device first.", "No Selection", "OK", "Warning")
        return
    }
    $selectedRow = $usbGrid.SelectedRows[0]
    $selectedDevice = $selectedRow.Tag
    if (-not $selectedDevice) {
        [System.Windows.Forms.MessageBox]::Show("Invalid selection.", "Error", "OK", "Error")
        return
    }
    
    Log-Message "Submitting request for: $($selectedDevice.FriendlyName)..."
    
    try {
        $serialNumber = "UNKNOWN"
        if ($selectedDevice.InstanceId -match "\\([^\\]+)$") {
            $serialNumber = $matches[1].Split('&')[0]
        }
        $vendorId = ""
        $productId = ""
        if ($selectedDevice.InstanceId -match "VID_([0-9A-F]{4})&PID_([0-9A-F]{4})") {
            $vendorId = $matches[1]
            $productId = $matches[2]
        }
        
        $payload = @{
            serial_number = $serialNumber
            device_name   = $selectedDevice.FriendlyName
            vendor_name   = $selectedDevice.Manufacturer
            vendor_id     = $vendorId
            product_id    = $productId
            device_class  = $selectedDevice.Class
            hardware_id   = ($selectedDevice.HardwareID -join ",")
            device_id     = $global:DeviceId
            computer_name = $env:COMPUTERNAME
            description   = "Request from Unified Test Agent"
        }
        
        $url = $urlBox.Text.TrimEnd("/")
        $apiUrl = "$url/api/usb/request"
        # We use strict Invoke-RestMethod for requests to get the response clearly
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body ($payload | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
        
        if ($response.success) {
            # Log success locally and to server logs if needed (but server likely logs requests)
            # We just show message here
            Log-Message "SUCCESS: Request submitted!"
            [System.Windows.Forms.MessageBox]::Show("Request submitted successfully!", "Success", "OK", "Information")
        }
        else {
            Log-Message "ERROR: $($response.error)"
            [System.Windows.Forms.MessageBox]::Show("Server error: $($response.error)", "Error", "OK", "Error")
        }
    }
    catch {
        Log-Message "ERROR: $($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show("Failed: $($_.Exception.Message)", "Error", "OK", "Error")
    }
}

# --- GUI Setup ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "CyArt Unified Policy Agent (Test Mode)"
$form.Size = New-Object System.Drawing.Size(600, 700)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Dock = "Fill"
$form.Controls.Add($tabs)

# -- Tab 1: Setup --
$tabSetup = New-Object System.Windows.Forms.TabPage
$tabSetup.Text = "1. Setup & Register"
$tabs.TabPages.Add($tabSetup)

$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = "Server URL:"
$lblUrl.Location = New-Object System.Drawing.Point(20, 20)
$tabSetup.Controls.Add($lblUrl)

$urlBox = New-Object System.Windows.Forms.TextBox
$urlBox.Text = "http://localhost:3000"
$urlBox.Location = New-Object System.Drawing.Point(20, 45)
$urlBox.Size = New-Object System.Drawing.Size(400, 25)
$tabSetup.Controls.Add($urlBox)

$chkOffline = New-Object System.Windows.Forms.CheckBox
$chkOffline.Text = "Offline Mode (Simulate Server)"
$chkOffline.Location = New-Object System.Drawing.Point(430, 48)
$chkOffline.AutoSize = $true
$chkOffline.Add_CheckedChanged({ $global:OfflineMode = $chkOffline.Checked })
$tabSetup.Controls.Add($chkOffline)

# Email Field
$lblEmail = New-Object System.Windows.Forms.Label
$lblEmail.Text = "Your Email (Required):"
$lblEmail.Location = New-Object System.Drawing.Point(20, 85)
$lblEmail.AutoSize = $true
$tabSetup.Controls.Add($lblEmail)

$emailBox = New-Object System.Windows.Forms.TextBox
$emailBox.Location = New-Object System.Drawing.Point(20, 110)
$emailBox.Size = New-Object System.Drawing.Size(400, 25)
$emailBox.PlaceholderText = "user@example.com"
$tabSetup.Controls.Add($emailBox)

$lblEmailHelp = New-Object System.Windows.Forms.Label
$lblEmailHelp.Text = "⚠️ Use the same email you use to login to the dashboard"
$lblEmailHelp.Location = New-Object System.Drawing.Point(20, 140)
$lblEmailHelp.AutoSize = $true
$lblEmailHelp.ForeColor = [System.Drawing.Color]::DarkOrange
$lblEmailHelp.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$tabSetup.Controls.Add($lblEmailHelp)

$btnReg = New-Object System.Windows.Forms.Button
$btnReg.Text = "Register Agent"
$btnReg.Location = New-Object System.Drawing.Point(20, 170)
$btnReg.Size = New-Object System.Drawing.Size(150, 40)
$btnReg.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
$btnReg.ForeColor = "White"
$btnReg.Add_Click({ Register-Device })
$tabSetup.Controls.Add($btnReg)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "Stop Agent (Kill)"
$btnStop.Location = New-Object System.Drawing.Point(200, 170)
$btnStop.Size = New-Object System.Drawing.Size(150, 40)
$btnStop.BackColor = [System.Drawing.Color]::FromArgb(200, 50, 50)
$btnStop.ForeColor = "White"
$btnStop.Add_Click({
        $notifyIcon.Visible = $false
        $form.Dispose()
        [System.Windows.Forms.Application]::Exit()
    })
$tabSetup.Controls.Add($btnStop)

$idLabel = New-Object System.Windows.Forms.Label
$idLabel.Text = "Device ID: Not Registered"
$idLabel.Location = New-Object System.Drawing.Point(20, 230)
$idLabel.AutoSize = $true
$idLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$tabSetup.Controls.Add($idLabel)

# -- Tab 2: Monitor & Requests --
$tabMonitor = New-Object System.Windows.Forms.TabPage
$tabMonitor.Text = "2. Monitor & Policies"
$tabs.TabPages.Add($tabMonitor)

# Policy Panel
$grpPolicy = New-Object System.Windows.Forms.GroupBox
$grpPolicy.Text = "Live Policy Status (Updates every 2s)"
$grpPolicy.Location = New-Object System.Drawing.Point(20, 20)
$grpPolicy.Size = New-Object System.Drawing.Size(520, 200)
$tabMonitor.Controls.Add($grpPolicy)

$lblLimit = New-Object System.Windows.Forms.Label
$lblLimit.Text = "Data Limit: Checking..."
$lblLimit.Location = New-Object System.Drawing.Point(20, 30)
$lblLimit.AutoSize = $true
$grpPolicy.Controls.Add($lblLimit)

$lblUsage = New-Object System.Windows.Forms.Label
$lblUsage.Text = "Current Usage: 0 MB"
$lblUsage.Location = New-Object System.Drawing.Point(250, 30)
$lblUsage.AutoSize = $true
$grpPolicy.Controls.Add($lblUsage)

$progBar = New-Object System.Windows.Forms.ProgressBar
$progBar.Location = New-Object System.Drawing.Point(20, 60)
$progBar.Size = New-Object System.Drawing.Size(480, 20)
$grpPolicy.Controls.Add($progBar)

$lblReadOnly = New-Object System.Windows.Forms.Label
$lblReadOnly.Text = "Read Only: Checking..."
$lblReadOnly.Location = New-Object System.Drawing.Point(20, 100)
$lblReadOnly.AutoSize = $true
$grpPolicy.Controls.Add($lblReadOnly)

$lblExpires = New-Object System.Windows.Forms.Label
$lblExpires.Text = "Expires: Checking..."
$lblExpires.Location = New-Object System.Drawing.Point(250, 100)
$lblExpires.AutoSize = $true
$grpPolicy.Controls.Add($lblExpires)

$lblEnforcement = New-Object System.Windows.Forms.Label
$lblEnforcement.Text = "Enforcement: Normal"
$lblEnforcement.Location = New-Object System.Drawing.Point(20, 150)
$lblEnforcement.AutoSize = $true
$lblEnforcement.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$grpPolicy.Controls.Add($lblEnforcement)

# Offline Controls
$grpOffline = New-Object System.Windows.Forms.GroupBox
$grpOffline.Text = "Offline Config (Check 'Offline Mode' in Setup)"
$grpOffline.Location = New-Object System.Drawing.Point(20, 225)
$grpOffline.Size = New-Object System.Drawing.Size(520, 60)
$tabMonitor.Controls.Add($grpOffline)

$lblOffLimit = New-Object System.Windows.Forms.Label
$lblOffLimit.Text = "Limit (MB):"
$lblOffLimit.Location = New-Object System.Drawing.Point(10, 25)
$lblOffLimit.AutoSize = $true
$grpOffline.Controls.Add($lblOffLimit)

$txtOfflineLimit = New-Object System.Windows.Forms.TextBox
$txtOfflineLimit.Text = "10"
$txtOfflineLimit.Location = New-Object System.Drawing.Point(80, 22)
$txtOfflineLimit.Size = New-Object System.Drawing.Size(50, 20)
$grpOffline.Controls.Add($txtOfflineLimit)

$chkOfflineRO = New-Object System.Windows.Forms.CheckBox
$chkOfflineRO.Text = "Read Only"
$chkOfflineRO.Location = New-Object System.Drawing.Point(150, 22)
$chkOfflineRO.AutoSize = $true
$grpOffline.Controls.Add($chkOfflineRO)

# USB Request Button (Opens Tab 3)
$btnUsb = New-Object System.Windows.Forms.Button
$btnUsb.Text = "Request USB Access..."
$btnUsb.Location = New-Object System.Drawing.Point(20, 300)
$btnUsb.Size = New-Object System.Drawing.Size(520, 40)
$btnUsb.Add_Click({ $tabs.SelectedTab = $tabUsb })
$tabMonitor.Controls.Add($btnUsb)

# -- Tab 3: USB Requests --
$tabUsb = New-Object System.Windows.Forms.TabPage
$tabUsb.Text = "3. USB Requests"
$tabs.TabPages.Add($tabUsb)

$lblUsbTitle = New-Object System.Windows.Forms.Label
$lblUsbTitle.Text = "Select a USB device to request whitelist access:"
$lblUsbTitle.Location = New-Object System.Drawing.Point(20, 20)
$lblUsbTitle.AutoSize = $true
$lblUsbTitle.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$tabUsb.Controls.Add($lblUsbTitle)

$usbGrid = New-Object System.Windows.Forms.DataGridView
$usbGrid.Location = New-Object System.Drawing.Point(20, 50)
$usbGrid.Size = New-Object System.Drawing.Size(520, 300)
$usbGrid.AllowUserToAddRows = $false
$usbGrid.AllowUserToDeleteRows = $false
$usbGrid.ReadOnly = $true
$usbGrid.SelectionMode = "FullRowSelect"
$usbGrid.MultiSelect = $false
$usbGrid.RowHeadersVisible = $false
$usbGrid.AutoSizeColumnsMode = "Fill"
$usbGrid.Columns.Add("DeviceName", "Device Name") | Out-Null
$usbGrid.Columns.Add("DeviceClass", "Class") | Out-Null
$usbGrid.Columns.Add("DeviceStatus", "Status") | Out-Null
$tabUsb.Controls.Add($usbGrid)

$btnRefreshUsb = New-Object System.Windows.Forms.Button
$btnRefreshUsb.Text = "Refresh Devices"
$btnRefreshUsb.Location = New-Object System.Drawing.Point(20, 360)
$btnRefreshUsb.Size = New-Object System.Drawing.Size(150, 35)
$btnRefreshUsb.Add_Click({ Load-USBDevices })
$tabUsb.Controls.Add($btnRefreshUsb)

$btnSubmitUsb = New-Object System.Windows.Forms.Button
$btnSubmitUsb.Text = "Submit Request"
$btnSubmitUsb.Location = New-Object System.Drawing.Point(180, 360)
$btnSubmitUsb.Size = New-Object System.Drawing.Size(150, 35)
$btnSubmitUsb.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
$btnSubmitUsb.ForeColor = "White"
$btnSubmitUsb.Add_Click({ Submit-USBRequest })
$tabUsb.Controls.Add($btnSubmitUsb)

# Status Log
$statusBox = New-Object System.Windows.Forms.TextBox
$statusBox.Multiline = $true
$statusBox.ScrollBars = "Vertical"
$statusBox.Location = New-Object System.Drawing.Point(20, 350)
$statusBox.Size = New-Object System.Drawing.Size(520, 230)
$statusBox.ReadOnly = $true
$statusBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$statusBox.Text = "Ready.`r`n"
$tabMonitor.Controls.Add($statusBox)

# --- System Tray Setup ---
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($PSHOME + "\powershell.exe")
$notifyIcon.Text = "CyArt Policy Agent"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenu
$menuItemShow = $contextMenu.MenuItems.Add("Open Dashboard")
$menuItemExit = $contextMenu.MenuItems.Add("Exit Agent")

$notifyIcon.ContextMenu = $contextMenu

# Show Dashboard Action
$actionShow = {
    $form.Show()
    $form.WindowState = "Normal"
    $form.ShowInTaskbar = $true
    $form.Activate()
}

$menuItemShow.Add_Click($actionShow)
$notifyIcon.Add_DoubleClick($actionShow)

# Exit Action
$menuItemExit.Add_Click({
        # Cleanup USB watchers
        Set-GlobalWriteProtect $false # Revert global policy on exit
        if ($global:UsbArrivalWatcher) { $global:UsbArrivalWatcher.Stop(); $global:UsbArrivalWatcher.Dispose() }
        if ($global:UsbRemovalWatcher) { $global:UsbRemovalWatcher.Stop(); $global:UsbRemovalWatcher.Dispose() }
        Get-EventSubscriber | Unregister-Event
        
        $notifyIcon.Visible = $false
        $form.Dispose()
        [System.Windows.Forms.Application]::Exit()
    })

# --- Form Logic ---

# Handle "X" button -> Minimize to Tray
$form.Add_FormClosing({
        param($obj, $e)
        # If the close reason is UserClosing, cancel and hide
        if ($e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
            $e.Cancel = $true
            $form.Hide()
            $notifyIcon.ShowBalloonTip(3000, "CyArt Agent", "Agent checks continue in the background.", [System.Windows.Forms.ToolTipIcon]::Info)
        }
    })

# Start Minimized (Silent Start)
$form.Add_Load({
        $form.Hide()
        $form.ShowInTaskbar = $false
    })

# --- Init ---
# Ensure WriteProtect is OFF on startup/exit to prevent accidental lockouts
Set-GlobalWriteProtect $false
Load-Config

# Auto-Register if needed
if ([string]::IsNullOrEmpty($global:DeviceId)) {
    Register-Device -silent $true
}

# Start the loop without blocking
# We use Application.Run context to handle tray events properly
[System.Windows.Forms.Application]::Run($form)

