# CyArt Agent - Mass Deployment Script for Windows
# This script compiles the agent and creates deployment packages

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CyArt Agent Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for server URL
Write-Host "Enter your Ubuntu server URL:" -ForegroundColor Yellow
Write-Host "  Examples:" -ForegroundColor Gray
Write-Host "    - Public IP: http://203.0.113.45:3000" -ForegroundColor Gray
Write-Host "    - Domain: https://server.yourcompany.com" -ForegroundColor Gray
Write-Host "    - ngrok: https://abc123.ngrok.io" -ForegroundColor Gray
Write-Host ""
$SERVER_URL = Read-Host "Server URL"

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

# Ensure go module dependencies for windows service wrapper
Write-Host "Ensuring Go windows/svc dependency..." -ForegroundColor Yellow
Push-Location $SCRIPT_DIR
try {
    # Initialize temporary module (if go.mod doesn't exist) to allow 'go get' to work cleanly
    if (-not (Test-Path (Join-Path $SCRIPT_DIR "go.mod"))) {
        & go mod init cyart-agent 2>$null
    }

    # Get needed package
    & go get golang.org/x/sys/windows/svc@latest
}
catch {
    Write-Host "Warning: go get failed or not available in PATH. Make sure 'go' is installed." -ForegroundColor Yellow
}

# Update the DEFAULT_API_URL in the source code with user's server URL
$srcFile = Join-Path $SCRIPT_DIR "windows-agent-production.go"
if (-not (Test-Path $srcFile)) {
    Write-Host "Error: $srcFile not found. Make sure this script and windows-agent-production.go are in the same folder." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Configuring server URL in source..." -ForegroundColor Yellow
$agentCode = Get-Content $srcFile -Raw
# Use regex replace that is robust to whitespace
$pattern = 'DEFAULT_API_URL\s*=\s*".*?"'
$replacement = "DEFAULT_API_URL = `"$SERVER_URL`""
$newCode = [regex]::Replace($agentCode, $pattern, $replacement)
Set-Content -Path $srcFile -Value $newCode -Encoding UTF8

Write-Host "  ✓ Configured server URL: $SERVER_URL" -ForegroundColor Green

# Set environment for Windows build
$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"

Write-Host "Compiling Windows agent..." -ForegroundColor Yellow

# Build the binary. Use windows GUI subsystem so no console pops when running as service.
$exePath = Join-Path $BUILD_DIR "CyArtAgent.exe"
# Use cmd /c so quoting works consistently
$buildCmd = "go build -ldflags=`"-s -w -H=windowsgui`" -o `"$exePath`" windows-agent-production.go"
cmd /c $buildCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "✓ Agent compiled successfully: $exePath" -ForegroundColor Green

# Create installer script (install.bat)
$installerScript = @'
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

REM Copy agent executable (assumes install.bat runs from same folder as exe)
echo Copying files...
copy /Y "%~dp0CyArtAgent.exe" "%INSTALL_DIR%\CyArtAgent.exe"
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy agent files. 
    echo Please manully stop 'CyArtAgent.exe' from Task Manager and retry.
    pause
    exit /b 1
)

REM Create Windows Service (will overwrite if exists)
echo Creating Windows Service...

sc create "CyArtAgent" binPath= "\"%INSTALL_DIR%\CyArtAgent.exe\"" start= auto DisplayName= "CyArt Security Agent"
if %errorLevel% neq 0 (
    echo [SC] CreateService FAILED.
    echo Please check Event Viewer for details.
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
if %errorLevel% neq 0 (
    echo [SC] StartService FAILED.
    echo The service may take a moment to initialize. Check the Windows Event Log if it fails to start.
    pause
    exit /b 1
)

echo.
echo ======================================
echo Installation completed successfully!
echo ======================================
echo.
echo The CyArt Agent is now installed as a Windows Service.
echo Service Name: CyArtAgent
echo Installation Path: %INSTALL_DIR%
echo.
echo Logs can be found at: %APPDATA%\CyArtAgent\agent.log
echo.
pause
'@

$installerScript | Out-File -FilePath (Join-Path $OUTPUT_DIR "install.bat") -Encoding ASCII

# Create uninstaller script
$uninstallerScript = @'
@echo off
REM CyArt Security Agent Uninstaller

echo ======================================
echo CyArt Security Agent Uninstaller
echo ======================================
echo.

REM Check for administrator privileges
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
echo.
pause
'@

$uninstallerScript | Out-File -FilePath (Join-Path $OUTPUT_DIR "uninstall.bat") -Encoding ASCII

# Copy executable to deployment folder
Copy-Item -Path $exePath -Destination (Join-Path $OUTPUT_DIR "CyArtAgent.exe") -Force

# Create Group Policy deployment script
$gpoScript = @'
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
'@

$gpoScript | Out-File -FilePath (Join-Path $OUTPUT_DIR "gpo-deploy.ps1") -Encoding UTF8

# Create SCCM deployment package
$sccmScript = @'
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
'@

$sccmScript | Out-File -FilePath (Join-Path $OUTPUT_DIR "sccm-install.ps1") -Encoding UTF8

# Create README
$readme = @"
CyArt Security Agent - Deployment Package v$AGENT_VERSION

Files Included:
1. CyArtAgent.exe - The agent executable
2. install.bat - Simple installer for single machines
3. uninstall.bat - Uninstaller
4. gpo-deploy.ps1 - Group Policy deployment script
5. sccm-install.ps1 - SCCM deployment script

Deployment Methods:

Method 1: Manual Installation (Single PC)
1. Copy the contents of the deployment folder to the target machine.
2. Run install.bat as Administrator (it will copy files and create a Windows service).
3. Check logs at: %APPDATA%\CyArtAgent\agent.log

Method 2: Group Policy Deployment
1. Copy CyArtAgent.exe to network share
2. Edit gpo-deploy.ps1 and update NETWORK_SHARE variable
3. Create GPO startup script
4. Link to target OU

Method 3: SCCM Deployment
1. Create Application in SCCM
2. Use sccm-install.ps1 as install script
3. Deploy to target collection

Server URL: $SERVER_URL

System Requirements:
- Windows 7/Server 2008 R2 or later
- Administrator privileges (installer)
- Network access to server
- ~10MB disk space

Built on: $(Get-Date -Format "yyyy-MM-dd")
"@

$readme | Out-File -FilePath (Join-Path $OUTPUT_DIR "README.txt") -Encoding UTF8

# Create 'development' folder inside deployment and copy only relevant files (do NOT copy folder into itself)
$devFolder = Join-Path $OUTPUT_DIR "development"
New-Item -ItemType Directory -Force -Path $devFolder | Out-Null

# Copy the final exe from the build directory into development
Copy-Item -Path $exePath -Destination (Join-Path $devFolder "CyArtAgent.exe") -Force

# Copy the generated scripts and README into development folder
$filesToCopy = @(
    "install.bat",
    "uninstall.bat",
    "gpo-deploy.ps1",
    "sccm-install.ps1",
    "README.txt"
)

foreach ($f in $filesToCopy) {
    $src = Join-Path $OUTPUT_DIR $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $devFolder $f) -Force
    }
}

# Return to original directory
Pop-Location

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Build completed successfully!" -ForegroundColor Green  
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Deployment package created at: $OUTPUT_DIR" -ForegroundColor Cyan
Write-Host ""
Write-Host "Package includes:" -ForegroundColor Yellow
Write-Host "  - CyArtAgent.exe (Agent executable)"
Write-Host "  - install.bat (Manual installer)"
Write-Host "  - uninstall.bat (Uninstaller)"
Write-Host "  - gpo-deploy.ps1 (Group Policy deployment)"
Write-Host "  - sccm-install.ps1 (SCCM deployment)"
Write-Host "  - README.txt (Deployment instructions)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Test the installer on a single machine first"
Write-Host "2. Deploy via GPO or SCCM for mass rollout"
Write-Host "3. Monitor devices in the CyArt dashboard"
Write-Host ""
