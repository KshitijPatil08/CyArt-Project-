# Group Policy Deployment Script for CyArt Agent
# Deploy via GPO -> Computer Configuration -> Policies -> Windows Settings -> Scripts -> Startup

# Installation path on network share (UPDATE THIS PATH)
$NETWORK_SHARE = "\\your-server\CyArtAgent"
$LOCAL_INSTALL = "$env:ProgramFiles\CyArtAgent"

# Check if already installed and running
$service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host "CyArt Agent already installed and running"
    exit 0
}

# Create installation directory
if (-not (Test-Path $LOCAL_INSTALL)) {
    New-Item -ItemType Directory -Path $LOCAL_INSTALL -Force | Out-Null
}

# Copy agent from network share
Copy-Item "$NETWORK_SHARE\CyArtAgent.exe" -Destination "$LOCAL_INSTALL\CyArtAgent.exe" -Force

# Create Windows Service
$params = @{
    Name = "CyArtAgent"
    BinaryPathName = "`"$LOCAL_INSTALL\CyArtAgent.exe`""
    DisplayName = "CyArt Security Agent"
    Description = "CyArt Device Tracking and Security Monitoring Agent"
    StartupType = "Automatic"
}

New-Service @params -ErrorAction SilentlyContinue

# Configure firewall
New-NetFirewallRule -DisplayName "CyArt Agent" -Direction Outbound -Program "$LOCAL_INSTALL\CyArtAgent.exe" -Action Allow -ErrorAction SilentlyContinue

# Start service
Start-Service -Name "CyArtAgent"

Write-Host "CyArt Agent installed successfully"
