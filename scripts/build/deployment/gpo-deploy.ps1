# Group Policy Deployment Script for CyArt Agent
$NETWORK_SHARE = "\\your-server\CyArtAgent"
$LOCAL_INSTALL = "$env:ProgramFiles\CyArtAgent"
$service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    exit 0
}
if (-not (Test-Path $LOCAL_INSTALL)) {
    New-Item -ItemType Directory -Path $LOCAL_INSTALL -Force | Out-Null
}
Copy-Item "$NETWORK_SHARE\CyArtAgent.exe" -Destination "$LOCAL_INSTALL\CyArtAgent.exe" -Force
$params = @{
    Name = "CyArtAgent"
    BinaryPathName = "`"$LOCAL_INSTALL\CyArtAgent.exe`""
    DisplayName = "CyArt Security Agent"
    Description = "CyArt Device Tracking and Security Monitoring Agent"
    StartupType = "Automatic"
}
New-Service @params -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "CyArt Agent" -Direction Outbound -Program "$LOCAL_INSTALL\CyArtAgent.exe" -Action Allow -ErrorAction SilentlyContinue
Start-Service -Name "CyArtAgent"
