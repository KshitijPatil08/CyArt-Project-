@echo off
REM CyArt Unified Test Agent - Silent Launcher

REM Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set "SCRIPT=%~dp0UnifiedTestAgent.ps1"
set "VBS_SCRIPT=%~dp0SilentLaunch.vbs"

echo.
echo [1/2] Creating silent launcher...

REM Create VBScript that launches PowerShell minimized (not hidden, so tray works)
(
echo Set objShell = CreateObject^("WScript.Shell"^)
echo objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File ""%SCRIPT%""", 7, False
) > "%VBS_SCRIPT%"

echo [2/2] Launching agent...

REM Check if already running
tasklist /FI "WINDOWTITLE eq CyArt Unified Policy Agent*" 2>NUL | find /I "powershell.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo     Agent is already running.
) else (
    REM Launch silently via VBScript
    wscript.exe "%VBS_SCRIPT%"
    echo     Agent started silently.
    timeout /t 2 >nul
    echo     Check system tray for the PowerShell icon.
)

echo.
echo ========================================================
echo  SUCCESS: Agent Running
echo  - Look for PowerShell icon in system tray
echo  - Right-click tray icon for "Open Dashboard"
echo ========================================================
echo.
pause
