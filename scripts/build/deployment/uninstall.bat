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
sc stop "CyArtAgent"
timeout /t 3 /nobreak >nul

echo Removing service...
sc delete "CyArtAgent"

echo Removing firewall rule...
netsh advfirewall firewall delete rule name="CyArt Agent"

echo Removing installation files...
set INSTALL_DIR=%ProgramFiles%\CyArtAgent
if exist "%INSTALL_DIR%" (
    rd /s /q "%INSTALL_DIR%"
)

echo.
echo Uninstallation completed.
echo.
pause
