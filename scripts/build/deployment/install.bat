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

REM Installation directory
set "INSTALL_DIR=%ProgramFiles%\CyArtAgent"

REM Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM FIXED: Always copy from folder where install.bat is located
set "SCRIPT_DIR=%~dp0"

echo Copying agent files...
copy /Y "%SCRIPT_DIR%CyArtAgent.exe" "%INSTALL_DIR%\CyArtAgent.exe"
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy agent files
    echo Source: %SCRIPT_DIR%CyArtAgent.exe
    echo Dest:   %INSTALL_DIR%\CyArtAgent.exe
    pause
    exit /b 1
)

REM Remove old service if exists
sc query "CyArtAgent" >nul 2>&1
if %errorLevel% equ 0 (
    echo Old service found. Removing...
    sc stop "CyArtAgent" >nul 2>&1
    sc delete "CyArtAgent" >nul 2>&1
    timeout /t 2 >nul
)

REM Create Windows Service
echo Creating Windows Service...
sc create "CyArtAgent" binPath= "\"%INSTALL_DIR%\CyArtAgent.exe\"" start= auto DisplayName= "CyArt Security Agent"
if %errorLevel% neq 0 (
    echo ERROR: Failed to create service
    pause
    exit /b 1
)

sc description "CyArtAgent" "CyArt Device Tracking and Security Monitoring Agent"

REM Firewall rule
netsh advfirewall firewall add rule name="CyArt Agent" dir=out action=allow program="%INSTALL_DIR%\CyArtAgent.exe" enable=yes >nul 2>&1

REM Start service
echo Starting CyArt Agent service...
sc start "CyArtAgent"
if %errorLevel% neq 0 (
    echo ERROR: Service failed to start.
    pause
    exit /b 1
)

echo.
echo ======================================
echo Installation completed successfully!
echo ======================================
echo.
pause
