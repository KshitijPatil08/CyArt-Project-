# CyArt Agent - Mass Deployment Script for Windows
# This script compiles the agent and creates deployment packages

Param([string]$ServerUrl)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CyArt Agent Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for server URL if not provided as parameter
if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    Write-Host "Enter your Ubuntu server URL:" -ForegroundColor Yellow
    Write-Host "  Examples:" -ForegroundColor Gray
    Write-Host "    - Public IP: http://203.0.113.45:3000" -ForegroundColor Gray
    Write-Host "    - Domain: https://server.yourcompany.com" -ForegroundColor Gray
    Write-Host "    - ngrok: https://abc123.ngrok.io" -ForegroundColor Gray
    Write-Host ""
    $SERVER_URL = Read-Host "Server URL"
}
else {
    $SERVER_URL = $ServerUrl
}

if ([string]::IsNullOrWhiteSpace($SERVER_URL)) {
    Write-Host "Error: Server URL is required!" -ForegroundColor Red
    exit 1
}

# Build the agent as Windows executable
Write-Host ""
Write-Host "Building CyArt Security Agent..." -ForegroundColor Cyan
Write-Host "Target Server: $SERVER_URL" -ForegroundColor Green

# Set variables
$AGENT_VERSION = "3.0.0"
$SCRIPT_DIR = $PSScriptRoot
$BUILD_DIR = Join-Path $SCRIPT_DIR "build"
$OUTPUT_DIR = Join-Path $BUILD_DIR "deployment"

# Create build directory
New-Item -ItemType Directory -Force -Path $BUILD_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# Ensure go module dependencies
Write-Host "Ensuring Go dependencies..." -ForegroundColor Yellow
Push-Location $SCRIPT_DIR
try {
    if (-not (Test-Path "go.mod")) { & go mod init cyart-agent 2>$null }
    & go get golang.org/x/sys/windows/svc@latest
    & go get github.com/google/gopacket
}
catch {
    Write-Host "Warning: go get failed." -ForegroundColor Yellow
}

# Update the DEFAULT_API_URL in the source code
$srcFile = Join-Path $SCRIPT_DIR "windows-agent-production.go"
Write-Host "Configuring server URL in source..." -ForegroundColor Yellow
$agentCode = Get-Content $srcFile -Raw
$encodedServerUrl = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($SERVER_URL))
$newCode = $agentCode -replace 'encodedAPIURL\s*=\s*".*?"', ('encodedAPIURL = "' + $encodedServerUrl + '"')
Set-Content -Path $srcFile -Value $newCode -Encoding UTF8

# Compile Windows agent
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
$exePath = Join-Path $BUILD_DIR "CyArtAgent.exe"
Write-Host "Compiling Windows agent..." -ForegroundColor Yellow
& go build -ldflags "-s -w -H=windowsgui" -o $exePath windows-agent-production.go
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location; exit 1
}

# Copy binary to deployment
Copy-Item $exePath (Join-Path $OUTPUT_DIR "CyArtAgent.exe") -Force

# Npcap Bundling
$npcapInstaller = Get-ChildItem -Filter "npcap-*.exe" | Select-Object -First 1
$npcapLogic = "echo Skipping Npcap..."
if ($npcapInstaller) {
    Copy-Item $npcapInstaller.FullName (Join-Path $OUTPUT_DIR $npcapInstaller.Name) -Force
    $npName = $npcapInstaller.Name
    $npcapLogic = @"
echo Checking for Npcap...
if exist "%ProgramFiles%\Npcap" (
    echo Npcap is already installed.
) else (
    echo Npcap not found. Installing...
    if exist "%~dp0$npName" (
        echo Running Npcap installer silently...
        "%~dp0$npName" /loopback_support=yes /winpcap_mode=yes /admin_only=no /S
        if %errorLevel% neq 0 (
             echo Warning: Npcap installation might have failed.
        ) else (
             echo Npcap installed successfully.
        )
    ) else (
        echo Warning: Npcap installer not found in package!
    )
)
"@
}

# --- GENERATE install.bat ---
$instTemplate = @'
@echo off
REM CyArt Security Agent Installer
REM Version 3.0.0

echo ======================================
echo CyArt Security Agent Installer
echo ======================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Administrator privileges required!
    echo Please run this installer as Administrator.
    pause
    exit /b 1
)

{NP_LOGIC}

echo Stopping existing services...

REM Check and Stop existing service
sc query "CyArtAgent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Found existing service. Stopping...
    sc stop "CyArtAgent" >nul 2>&1
    timeout /t 2 >nul
    sc delete "CyArtAgent" >nul 2>&1
)

REM Force kill any lingering processes
taskkill /F /IM CyArtAgent.exe >nul 2>&1
timeout /t 1 >nul

echo Installing CyArt Security Agent...

REM Create installation directory
set "INSTALL_DIR=%ProgramFiles%\CyArtAgent"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy agent executable
echo Copying files...
copy /Y "%~dp0CyArtAgent.exe" "%INSTALL_DIR%\CyArtAgent.exe"
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy agent files. 
    echo Please manully stop 'CyArtAgent.exe' from Task Manager and retry.
    pause
    exit /b 1
)

REM Create Windows Service
echo Creating Windows Service...
sc create "CyArtAgent" binPath= "\"%INSTALL_DIR%\CyArtAgent.exe\"" start= auto DisplayName= "CyArt Security Agent"
if %errorLevel% neq 0 (
    echo [SC] CreateService FAILED.
    pause
    exit /b 1
)
sc description "CyArtAgent" "CyArt Device Tracking and Security Monitoring Agent"

REM Configure firewall
echo Configuring Windows Firewall...
netsh advfirewall firewall add rule name="CyArt Agent" dir=out action=allow program="%INSTALL_DIR%\CyArtAgent.exe" enable=yes

REM Start the service
echo Starting CyArt Agent service...
sc start "CyArtAgent"

echo.
echo ======================================
echo Installation completed successfully!
echo ======================================
pause
'@
$instContent = $instTemplate.Replace("{NP_LOGIC}", $npcapLogic)
$instContent | Out-File (Join-Path $OUTPUT_DIR "install.bat") -Encoding ASCII

# --- GENERATE uninstall.bat ---
$uninstContent = @'
@echo off
REM CyArt Security Agent Uninstaller
echo ======================================
echo CyArt Security Agent Uninstaller
echo ======================================
echo.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Administrator privileges required!
    pause
    exit /b 1
)
echo Stopping CyArt Agent service...
sc stop "CyArtAgent" >nul 2>&1
timeout /t 3 /nobreak >nul
echo Removing service...
sc delete "CyArtAgent" >nul 2>&1
echo Removing firewall rule...
netsh advfirewall firewall delete rule name="CyArt Agent" >nul 2>&1
echo Removing installation files...
set "INSTALL_DIR=%ProgramFiles%\CyArtAgent"
if exist "%INSTALL_DIR%" (
    rd /s /q "%INSTALL_DIR%"
)
echo.
echo Uninstallation completed.
pause
'@
$uninstContent | Out-File (Join-Path $OUTPUT_DIR "uninstall.bat") -Encoding ASCII

# --- GENERATE gpo-deploy.ps1 ---
$gpoContent = @'
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
'@
$gpoContent | Out-File (Join-Path $OUTPUT_DIR "gpo-deploy.ps1") -Encoding UTF8

# --- GENERATE sccm-install.ps1 ---
$sccmContent = @'
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
} else {
    sc.exe create "CyArtAgent" binPath= "`"$INSTALL_DIR\$AGENT_EXE`"" start= auto DisplayName= "CyArt Security Agent"
    sc.exe description "CyArtAgent" "CyArt Device Tracking and Security Monitoring Agent"
    sc.exe start "CyArtAgent"
}
netsh advfirewall firewall add rule name="CyArt Agent" dir=out action=allow program="$INSTALL_DIR\$AGENT_EXE" enable=yes
'@
$sccmContent | Out-File (Join-Path $OUTPUT_DIR "sccm-install.ps1") -Encoding UTF8

# --- GENERATE README.txt ---
$readme = "CyArt Agent v$AGENT_VERSION`nServer: $SERVER_URL`nDate: $((Get-Date -Format 'yyyy-MM-dd'))`n`n1. Run install.bat as Admin."
$readme | Out-File (Join-Path $OUTPUT_DIR "README.txt")

Pop-Location
Write-Host "Build Success!" -ForegroundColor Green
