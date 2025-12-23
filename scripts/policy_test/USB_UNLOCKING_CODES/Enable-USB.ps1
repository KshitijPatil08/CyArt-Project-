# Enable-USB.ps1
# Finds and enables disabled USB devices (Error Code 22)

Write-Host "=== USB Device Re-Enabler ===" -ForegroundColor Cyan
Write-Host ""

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Run as Administrator!" -ForegroundColor Red
    pause
    exit
}

Write-Host "Scanning for disabled USB devices..." -ForegroundColor Yellow

# CM_PROB_DISABLED = 22
$disabledDevices = Get-PnpDevice | Where-Object { $_.ConfigManagerErrorCode -eq 22 -and ($_.Class -eq 'USB' -or $_.Class -eq 'DiskDrive' -or $_.InstanceId -match 'USB') }

if ($disabledDevices.Count -eq 0) {
    Write-Host "No disabled USB devices found." -ForegroundColor Green
}
else {
    Write-Host "Found $($disabledDevices.Count) disabled device(s):" -ForegroundColor Red
    foreach ($dev in $disabledDevices) {
        Write-Host "  - [$($dev.Class)] $($dev.FriendlyName) ($($dev.InstanceId))" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Attempting to enable all found devices..." -ForegroundColor Yellow
    
    foreach ($dev in $disabledDevices) {
        Write-Host "  Enabling: $($dev.FriendlyName)..." -NoNewline
        try {
            Enable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction Stop
            Write-Host " [OK]" -ForegroundColor Green
        }
        catch {
            Write-Host " [FAILED]" -ForegroundColor Red
            Write-Host "    $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "Scanning complete. Don't forget to run Unlock-USB.ps1 if the drive is Read-Only!" -ForegroundColor Cyan
pause
