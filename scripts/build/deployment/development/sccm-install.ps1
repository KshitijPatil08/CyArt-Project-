# SCCM Deployment Script for CyArt Agent
# Use this as an SCCM Application Install Script

$INSTALL_DIR = "$env:ProgramFiles\CyArtAgent"
$AGENT_EXE = "CyArtAgent.exe"

# Check if already installed
$service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Updating existing installation..."
    Stop-Service -Name "CyArtAgent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    Write-Host "Installing CyArt Agent..."
}

# Create installation directory
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null

# Copy agent executable
Copy-Item ".\$AGENT_EXE" -Destination "$INSTALL_DIR\$AGENT_EXE" -Force

# Create or update service
if ($service) {
    # Service exists, just start it
    Start-Service -Name "CyArtAgent"
} else {
    # Create new service
    sc.exe create "CyArtAgent" binPath= "`"$INSTALL_DIR\$AGENT_EXE`"" start= auto DisplayName= "CyArt Security Agent"
    sc.exe description "CyArtAgent" "CyArt Device Tracking and Security Monitoring Agent"
    sc.exe start "CyArtAgent"
}

# Configure firewall
netsh advfirewall firewall add rule name="CyArt Agent" dir=out action=allow program="$INSTALL_DIR\$AGENT_EXE" enable=yes

Write-Host "Installation completed successfully"
Exit 0
