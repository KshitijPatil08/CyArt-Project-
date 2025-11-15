# Quick Start: Build and Deploy CyArt Agent

## For IT Administrators

This guide will help you quickly build and deploy the CyArt Security Agent to your Windows devices.

---

## Step 1: Build the Agent (.exe)

### Prerequisites
- Windows 10/11 or Windows Server
- Go 1.21+ installed ([Download Go](https://go.dev/dl/))
- PowerShell with execution policy set

### Build Commands

```powershell
# Navigate to scripts directory
cd CyArt-Project-\scripts

# Run the build script
.\build-agent.ps1
```

This will create:
- `build\deployment\CyArtAgent.exe` - Ready-to-deploy executable
- `build\deployment\install.bat` - Simple installer
- `build\deployment\uninstall.bat` - Uninstaller
- `build\deployment\gpo-deploy.ps1` - Group Policy deployment
- `build\deployment\sccm-install.ps1` - SCCM deployment
- `build\deployment\README.txt` - Deployment instructions

**Alternative: Manual Build**

```powershell
# Build directly with Go
cd scripts
$env:GOOS="windows"
$env:GOARCH="amd64"
$env:CGO_ENABLED="0"
go build -ldflags="-s -w" -o CyArtAgent.exe windows-agent-production.go
```

---

## Step 2: Test on Single Machine

```powershell
# Copy to test machine
cd build\deployment

# Run installer as Administrator
Right-click install.bat → Run as Administrator
```

**Verify Installation**
```powershell
# Check service status
sc query CyArtAgent

# View logs
notepad %APPDATA%\CyArtAgent\agent.log

# Should see:
# - "Device registered: <uuid>"
# - "Agent started successfully"
```

---

## Step 3: Deploy to All Devices

Choose the deployment method that fits your environment:

### Option A: Group Policy (Recommended for Active Directory)

**Prerequisites:**
- Active Directory domain
- Network share accessible by all computers
- Domain admin rights

**Steps:**

1. **Create Network Share**
   ```powershell
   # On domain controller or file server
   New-Item -ItemType Directory -Path "C:\IT\CyArtAgent"
   Copy-Item ".\CyArtAgent.exe" -Destination "C:\IT\CyArtAgent\"
   New-SmbShare -Name "CyArtAgent" -Path "C:\IT\CyArtAgent" -ReadAccess "Domain Computers"
   ```

2. **Edit Deployment Script**
   - Open `gpo-deploy.ps1`
   - Change line: `$NETWORK_SHARE = "\\your-server\CyArtAgent"`
   - To: `$NETWORK_SHARE = "\\your-actual-server\CyArtAgent"`

3. **Create GPO**
   ```
   Open: Group Policy Management Console
   
   1. Right-click your domain/OU → Create a GPO
   2. Name it: "CyArt Agent Deployment"
   3. Right-click GPO → Edit
   4. Navigate to:
      Computer Configuration 
      → Policies 
      → Windows Settings 
      → Scripts (Startup/Shutdown)
   5. Double-click "Startup"
   6. Click "PowerShell Scripts" tab
   7. Click "Add" → Browse to gpo-deploy.ps1
   8. Click OK
   9. Link GPO to target OU
   ```

4. **Force Update**
   ```powershell
   # On client machines
   gpupdate /force
   
   # Or restart machines
   ```

5. **Monitor Rollout**
   - Check dashboard for new devices registering
   - Verify devices appear as "online"

### Option B: SCCM/ConfigMgr

1. **Create Application**
   - Software Library → Applications → Create Application
   - Manually specify application information
   - Name: "CyArt Security Agent"

2. **Add Deployment Type**
   - Content location: Path to `build\deployment`
   - Installation program: `powershell -ExecutionPolicy Bypass -File sccm-install.ps1`
   - Detection method: PowerShell script
     ```powershell
     $service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
     if ($service) { Write-Host "Installed" }
     ```

3. **Deploy**
   - Right-click application → Deploy
   - Collection: "All Workstations" (or your target)
   - Purpose: Required
   - Schedule: As soon as possible

### Option C: Intune/MDM

1. **Package Agent**
   ```powershell
   # Download Microsoft Win32 Content Prep Tool
   # https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool
   
   IntuneWinAppUtil.exe -c ".\deployment" -s "CyArtAgent.exe" -o ".\intune"
   ```

2. **Upload to Intune**
   - Microsoft Endpoint Manager admin center
   - Apps → Windows → Add
   - App type: Windows app (Win32)
   - Select the .intunewin file

3. **Configure Installation**
   - Install command: `install.bat`
   - Uninstall command: `uninstall.bat`
   - Detection rules: Check for service "CyArtAgent"

4. **Assign**
   - Assignments → Add group → All devices

### Option D: Manual/Remote PowerShell

**For small deployments (< 20 devices):**

```powershell
# Define target computers
$computers = @("PC001", "PC002", "PC003")

# Deploy to each
foreach ($computer in $computers) {
    Write-Host "Deploying to $computer..."
    
    # Copy installer
    Copy-Item ".\CyArtAgent.exe" -Destination "\\$computer\C$\Temp\"
    Copy-Item ".\install.bat" -Destination "\\$computer\C$\Temp\"
    
    # Run installer remotely
    Invoke-Command -ComputerName $computer -ScriptBlock {
        Start-Process -FilePath "C:\Temp\install.bat" -Verb RunAs -Wait
    }
    
    Write-Host "✓ Deployed to $computer"
}
```

---

## Step 4: Verify Deployment

### Check Dashboard
1. Open CyArt dashboard
2. Navigate to Device Management
3. Verify all devices are listed and "online"

### Check Individual Devices

```powershell
# Run on each device or remotely
Invoke-Command -ComputerName PC001 -ScriptBlock {
    # Check service
    Get-Service -Name "CyArtAgent"
    
    # Check last log entry
    Get-Content "$env:APPDATA\CyArtAgent\agent.log" -Tail 5
}
```

**Expected Output:**
- Service Status: Running
- Last log: "Device status updated" or "USB devices tracked"

---

## Step 5: Test Quarantine Feature

### From Dashboard
1. Go to Device Management
2. Select a test device
3. Click "Quarantine Device"
4. Reason: "Security test"
5. Click Confirm

### On the Device
Within 10 seconds, the device should:
- ✅ Lose network connectivity
- ✅ Display quarantine warning
- ✅ Block USB storage devices
- ✅ Show as "quarantined" in dashboard

### Release Device
1. In dashboard, select device
2. Click "Release from Quarantine"
3. Device should restore network access within 10 seconds

---

## Troubleshooting

### Agent Won't Connect to Server

**Check 1: Network Connectivity**
```powershell
Test-NetConnection -ComputerName 192.168.1.100 -Port 3000
```

**Check 2: Server URL**
```powershell
notepad %APPDATA%\CyArtAgent\agent.config
# Should show correct server IP
```

**Check 3: Firewall**
```powershell
# Allow outbound connections
netsh advfirewall firewall add rule name="CyArt Agent Out" dir=out action=allow program="%ProgramFiles%\CyArtAgent\CyArtAgent.exe"
```

**Fix: Manual Server Configuration**
```powershell
# Edit config file
notepad %APPDATA%\CyArtAgent\agent.config

# Change to:
{"server_url":"http://YOUR-SERVER-IP:3000"}

# Restart service
net stop CyArtAgent
net start CyArtAgent
```

### Service Won't Start

**Check 1: Run as Administrator**
```powershell
# Service requires admin privileges
# Re-run installer as Administrator
```

**Check 2: Check Event Log**
```powershell
Get-EventLog -LogName Application -Source "CyArtAgent" -Newest 10
```

**Check 3: Manual Start**
```powershell
# Try starting service manually
sc start CyArtAgent

# Check status
sc query CyArtAgent
```

### Devices Not Showing in Dashboard

**Check 1: Agent Logs**
```powershell
notepad %APPDATA%\CyArtAgent\agent.log
# Look for "Device registered" message
```

**Check 2: Server API**
```powershell
# Test API endpoint
curl http://YOUR-SERVER-IP:3000/api/devices/list
```

**Check 3: Database Connection**
- Verify Supabase credentials
- Check database policies
- Verify RLS policies allow inserts

### Quarantine Not Working

**Check 1: Agent Version**
```powershell
# In agent.log, should see version 3.0.0 or higher
findstr "version" %APPDATA%\CyArtAgent\agent.log
```

**Check 2: Permissions**
```powershell
# Service must run as SYSTEM account
sc qc CyArtAgent
# Check obj: should be LocalSystem
```

**Check 3: API Endpoint**
```bash
# Test quarantine status endpoint
curl http://YOUR-SERVER-IP:3000/api/devices/quarantine/status?device_id=xxx
```

---

## Uninstall Agent

### Single Device
```powershell
# Run uninstaller
cd %ProgramFiles%\CyArtAgent
uninstall.bat
```

### Multiple Devices (GPO)
1. Remove GPO link from OU
2. Create uninstall GPO
3. Add shutdown script: `sc delete CyArtAgent`

### Via Remote PowerShell
```powershell
Invoke-Command -ComputerName PC001 -ScriptBlock {
    sc stop CyArtAgent
    sc delete CyArtAgent
    Remove-Item -Path "$env:ProgramFiles\CyArtAgent" -Recurse -Force
}
```

---

## Summary

### What You Get

✅ **Executable Agent** - Single .exe file, no dependencies  
✅ **Auto-Discovery** - Finds server automatically on local network  
✅ **USB Tracking** - Monitors all USB device connections  
✅ **Security Logging** - Collects Windows security events  
✅ **Remote Quarantine** - Isolate malicious devices instantly  
✅ **Mass Deployment** - GPO/SCCM/Intune ready  
✅ **Windows Service** - Runs in background, starts on boot  

### Deployment Timeline

| Task | Time |
|------|------|
| Build agent | 5 minutes |
| Test on 1 device | 10 minutes |
| Setup GPO/SCCM | 30 minutes |
| Deploy to 100 devices | 1-2 hours (automatic) |
| Verify deployment | 30 minutes |

### Resource Requirements

**Per Device:**
- Disk: ~10 MB
- RAM: ~20 MB
- CPU: < 1% average
- Network: ~100 KB/min

**Server:**
- CPU: 2 cores minimum
- RAM: 4 GB minimum
- Disk: 50 GB (grows with logs)
- Network: 100 Mbps

---

## Next Steps

1. ✅ Build agent → `.\build-agent.ps1`
2. ✅ Test on pilot group (5-10 devices)
3. ✅ Monitor for 24 hours
4. ✅ Deploy to entire organization
5. ✅ Setup monitoring and alerts
6. ✅ Train security team on quarantine feature

---

## Support

**Documentation:**
- Full deployment guide: `PRODUCTION_DEPLOYMENT_GUIDE.md`
- Server setup: `SERVER_SETUP_GUIDE.md`
- Agent installation: `AGENT_INSTALLATION_GUIDE.md`

**Common Issues:**
- Agent connection issues → Check firewall and server URL
- Service won't start → Run installer as Administrator
- Quarantine not working → Verify agent version 3.0.0+

**Logs:**
- Agent: `%APPDATA%\CyArtAgent\agent.log`
- Service: Windows Event Viewer → Application
- Server: `pm2 logs cyart-server`

---

**Ready to deploy? Start with: `.\build-agent.ps1`** 🚀
