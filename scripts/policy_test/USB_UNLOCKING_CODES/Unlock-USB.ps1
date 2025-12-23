# USB Unlock Script
# This script removes the read-only attribute from USB drives that were locked by diskpart

Write-Host "=== USB Drive Unlock Tool ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    pause
    exit
}

# List all removable drives
Write-Host "Scanning for USB drives..." -ForegroundColor Yellow
$usbDrives = Get-Disk | Where-Object { $_.BusType -eq 'USB' }

if ($usbDrives.Count -eq 0) {
    Write-Host "No USB drives detected. Please insert your USB drive and try again." -ForegroundColor Red
    pause
    exit
}

Write-Host "Found $($usbDrives.Count) USB drive(s):" -ForegroundColor Green
Write-Host ""

foreach ($disk in $usbDrives) {
    $size = [math]::Round($disk.Size / 1GB, 2)
    $status = if ($disk.IsReadOnly) { "READ-ONLY (LOCKED)" } else { "Writable" }
    $color = if ($disk.IsReadOnly) { "Red" } else { "Green" }
    
    Write-Host "  Disk $($disk.Number): $($disk.FriendlyName) - ${size}GB - Status: " -NoNewline
    Write-Host $status -ForegroundColor $color
}

Write-Host ""
Write-Host "Enter the disk number to unlock (or 'ALL' to unlock all USB drives): " -ForegroundColor Cyan -NoNewline
$choice = Read-Host

$disksToUnlock = @()

if ($choice -eq "ALL") {
    $disksToUnlock = $usbDrives | Where-Object { $_.IsReadOnly }
    if ($disksToUnlock.Count -eq 0) {
        Write-Host "No locked USB drives found!" -ForegroundColor Green
        pause
        exit
    }
}
else {
    $diskNum = [int]$choice
    $selectedDisk = $usbDrives | Where-Object { $_.Number -eq $diskNum }
    
    if (-not $selectedDisk) {
        Write-Host "Invalid disk number!" -ForegroundColor Red
        pause
        exit
    }
    
    $disksToUnlock = @($selectedDisk)
}

Write-Host ""
Write-Host "Unlocking disk(s)..." -ForegroundColor Yellow

foreach ($disk in $disksToUnlock) {
    Write-Host "  Processing Disk $($disk.Number)..." -ForegroundColor Cyan
    
    try {
        # Method 1: Using Set-Disk cmdlet
        Set-Disk -Number $disk.Number -IsReadOnly $false -ErrorAction Stop
        Write-Host "    [OK] Disk $($disk.Number) unlocked successfully!" -ForegroundColor Green
    }
    catch {
        Write-Host "    [!] Method 1 failed, trying diskpart..." -ForegroundColor Yellow
        
        # Method 2: Using diskpart (more forceful)
        $diskpartScript = @"
select disk $($disk.Number)
attributes disk clear readonly
exit
"@
        
        $diskpartScript | diskpart | Out-Null
        
        # Verify
        $verifyDisk = Get-Disk -Number $disk.Number
        if (-not $verifyDisk.IsReadOnly) {
            Write-Host "    [OK] Disk $($disk.Number) unlocked using diskpart!" -ForegroundColor Green
        }
        else {
            Write-Host "    [X] Failed to unlock Disk $($disk.Number)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=== Final Status ===" -ForegroundColor Cyan
$finalDrives = Get-Disk | Where-Object { $_.BusType -eq 'USB' }
foreach ($disk in $finalDrives) {
    $status = if ($disk.IsReadOnly) { "STILL LOCKED" } else { "UNLOCKED - Ready to use" }
    $color = if ($disk.IsReadOnly) { "Red" } else { "Green" }
    Write-Host "  Disk $($disk.Number): " -NoNewline
    Write-Host $status -ForegroundColor $color
}

Write-Host ""
Write-Host "Done! You can now use your USB drive normally." -ForegroundColor Green
pause
