# SCCM Deployment Script for CyArt Agent
$INSTALL_DIR = "$env:ProgramFiles\CyArtAgent"
$AGENT_EXE = "CyArtAgent.exe"
$service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
if ($service) {
    Stop-Service -Name "CyArtAgent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
Copy-Item ".\$AGENT_EXE" -Destination "$INSTALL_DIR\$AGENT_EXE" -Force
if ($service) {
    Start-Service -Name "CyArtAgent"
}
else {
    sc.exe create "CyArtAgent" binPath= "`"$INSTALL_DIR\$AGENT_EXE`"" start= auto DisplayName= "CyArt Security Agent"
    sc.exe description "CyArtAgent" "CyArt Device Tracking and Security Monitoring Agent"
    sc.exe start "CyArtAgent"
}
netsh advfirewall firewall add rule name="CyArt Agent" dir=out action=allow program="$INSTALL_DIR\$AGENT_EXE" enable=yes
