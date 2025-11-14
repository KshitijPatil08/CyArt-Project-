# Agent Installation Guide

This guide explains how to install and run the monitoring agents on Windows, macOS, and Linux.

## Windows Agent (.exe)

### Building the .exe File

The Windows agent needs to be compiled from source. You have several options:

#### Option 1: Using PS2EXE (PowerShell Module)

1. Install PS2EXE module:
   ```powershell
   Install-Module -Name ps2exe -Force
   ```

2. Create a PowerShell script wrapper (create `build-windows-agent.ps1`):
   ```powershell
   # This script compiles the agent logic to .exe
   # Note: You'll need to convert the PowerShell logic to a compiled executable
   
   # For now, use a batch file wrapper or scheduled task
   ```

#### Option 2: Using Go (Recommended)

Create a Go-based agent that compiles to .exe:

1. Install Go: https://golang.org/dl/
2. Create `scripts/windows-agent.go` (see below)
3. Compile:
   ```bash
   go build -o CyArtAgent.exe scripts/windows-agent.go
   ```

#### Option 3: Using Python with PyInstaller

1. Install Python and PyInstaller:
   ```bash
   pip install pyinstaller
   ```

2. Create Python agent script
3. Compile:
   ```bash
   pyinstaller --onefile --windowed --name CyArtAgent scripts/windows-agent.py
   ```

### Running the Windows Agent

Once you have the .exe file:

1. **First Run (Registration)**:
   - Double-click `CyArtAgent.exe`
   - It will register the device and start monitoring
   - Device ID is stored in `%APPDATA%\CyArtAgent\device_id.txt`

2. **Run in Background**:
   - Create a scheduled task to run on startup
   - Or use: `Start-Process -FilePath "CyArtAgent.exe" -WindowStyle Hidden`

3. **As a Windows Service**:
   - Use NSSM (Non-Sucking Service Manager) to install as service
   - Download: https://nssm.cc/download
   - Install: `nssm install CyArtAgent "C:\path\to\CyArtAgent.exe"`

## Linux Agent

### Installation

1. **Download the agent script**:
   ```bash
   wget https://your-server.com/scripts/linux-agent.sh
   # Or copy from your project
   ```

2. **Make it executable**:
   ```bash
   chmod +x linux-agent.sh
   ```

3. **Run manually** (for testing):
   ```bash
   ./linux-agent.sh https://v0-project1-r9.vercel.app "My Linux PC" "username" "Office"
   ```

4. **Install as systemd service** (recommended):
   
   Create service file:
   ```bash
   sudo nano /etc/systemd/system/cyart-agent.service
   ```
   
   Add:
   ```ini
   [Unit]
   Description=CyArt Monitoring Agent
   After=network.target

   [Service]
   Type=simple
   User=root
   ExecStart=/usr/local/bin/cyart-agent.sh
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal

   [Install]
   WantedBy=multi-user.target
   ```

   Install and start:
   ```bash
   sudo cp linux-agent.sh /usr/local/bin/cyart-agent.sh
   sudo chmod +x /usr/local/bin/cyart-agent.sh
   sudo systemctl daemon-reload
   sudo systemctl enable cyart-agent
   sudo systemctl start cyart-agent
   sudo systemctl status cyart-agent
   ```

### Configuration

Edit the script to set your API URL:
```bash
API_URL="https://v0-project1-r9.vercel.app"
```

Or pass as argument:
```bash
./linux-agent.sh https://your-api-url.com
```

## macOS Agent

### Installation

1. **Download the agent script**:
   ```bash
   wget https://your-server.com/scripts/mac-agent.sh
   # Or copy from your project
   ```

2. **Make it executable**:
   ```bash
   chmod +x mac-agent.sh
   ```

3. **Run manually** (for testing):
   ```bash
   ./mac-agent.sh https://v0-project1-r9.vercel.app "My Mac" "username" "Office"
   ```

4. **Install as LaunchDaemon** (recommended):
   
   Create plist file:
   ```bash
   sudo nano /Library/LaunchDaemons/com.cyart.agent.plist
   ```
   
   Add:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.cyart.agent</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/local/bin/cyart-agent.sh</string>
           <string>https://v0-project1-r9.vercel.app</string>
       </array>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
       <key>StandardOutPath</key>
       <string>/var/log/cyart-agent.log</string>
       <key>StandardErrorPath</key>
       <string>/var/log/cyart-agent.error.log</string>
   </dict>
   </plist>
   ```

   Install and start:
   ```bash
   sudo cp mac-agent.sh /usr/local/bin/cyart-agent.sh
   sudo chmod +x /usr/local/bin/cyart-agent.sh
   sudo launchctl load /Library/LaunchDaemons/com.cyart.agent.plist
   sudo launchctl start com.cyart.agent
   ```

### macOS Permissions

macOS may require permissions:
- System Preferences → Security & Privacy → Privacy → Full Disk Access
- Add the agent script or terminal application

## Agent Features

All agents:
- ✅ Register device once (stores device_id locally)
- ✅ Run in background continuously
- ✅ Collect overall system logs (not just USB)
- ✅ Monitor USB devices
- ✅ Send events to API every 30 seconds
- ✅ Update device status

## Verification

After installation, verify the agent is working:

1. **Check logs**:
   - Windows: `%APPDATA%\CyArtAgent\agent.log`
   - Linux: `~/.cyart-agent/agent.log` or `journalctl -u cyart-agent`
   - macOS: `~/.cyart-agent/agent.log` or `/var/log/cyart-agent.log`

2. **Check device registration**:
   - Go to Dashboard → Devices
   - Your device should appear with status "online"

3. **Test USB monitoring**:
   - Connect a USB device
   - Check Dashboard → USB Activity
   - Event should appear within 30 seconds

## Troubleshooting

### Agent Not Registering

- Check internet connectivity
- Verify API URL is correct
- Check firewall settings
- Review agent logs for errors

### USB Events Not Showing

- Verify USB device has serial number
- Check agent logs for USB detection
- Ensure agent has proper permissions (Linux/macOS may need sudo)

### Agent Stops Running

- Check service status: `systemctl status cyart-agent` (Linux)
- Check launchd: `launchctl list | grep cyart` (macOS)
- Review logs for errors
- Ensure device_id file exists and is valid

## Uninstallation

### Linux
```bash
sudo systemctl stop cyart-agent
sudo systemctl disable cyart-agent
sudo rm /etc/systemd/system/cyart-agent.service
sudo rm /usr/local/bin/cyart-agent.sh
sudo systemctl daemon-reload
```

### macOS
```bash
sudo launchctl unload /Library/LaunchDaemons/com.cyart.agent.plist
sudo rm /Library/LaunchDaemons/com.cyart.agent.plist
sudo rm /usr/local/bin/cyart-agent.sh
```

### Windows
- Stop the service: `nssm stop CyArtAgent`
- Remove service: `nssm remove CyArtAgent`
- Delete files from installation directory

