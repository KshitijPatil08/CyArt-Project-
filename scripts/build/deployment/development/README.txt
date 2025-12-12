CyArt Security Agent - Deployment Package v3.0.0

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

Server URL:  https://lily-recrudescent-scantly.ngrok-free.dev

System Requirements:
- Windows 7/Server 2008 R2 or later
- Administrator privileges (installer)
- Network access to server
- ~10MB disk space

Built on: 2025-12-12
