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

echo Installing CyArt Security Agent...

REM Create installation directory
set "INSTALL_DIR=%ProgramFiles%\CyArtAgent"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy agent executable (assumes install.bat runs from same folder as exe)
copy /Y "%~dp0CyArtAgent.exe" "%INSTALL_DIR%\CyArtAgent.exe"
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy agent files
    pause
    exit /b 1
)

REM Create Windows Service (will overwrite if exists)
echo Creating Windows Service...
sc query "CyArtAgent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Service exists. Attempting to remove old service...
    sc stop "CyArtAgent" >nul 2>&1
    sc delete "CyArtAgent" >nul 2>&1
    timeout /t 2 >nul
)

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
