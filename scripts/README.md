# Agent Scripts

This directory contains the monitoring agents for different operating systems.

## Files

- **windows-agent.go** - Windows agent (compiles to .exe)
- **linux-agent.sh** - Linux agent (shell script)
- **mac-agent.sh** - macOS agent (shell script)

## Quick Start

### Windows

1. Install Go: https://golang.org/dl/
2. Compile:
   ```bash
   go build -o CyArtAgent.exe windows-agent.go
   ```
3. Run:
   ```bash
   CyArtAgent.exe
   ```

### Linux

1. Make executable:
   ```bash
   chmod +x linux-agent.sh
   ```
2. Run:
   ```bash
   ./linux-agent.sh [API_URL] [DEVICE_NAME] [OWNER] [LOCATION]
   ```
3. Install as service (see AGENT_INSTALLATION_GUIDE.md)

### macOS

1. Make executable:
   ```bash
   chmod +x mac-agent.sh
   ```
2. Run:
   ```bash
   ./mac-agent.sh [API_URL] [DEVICE_NAME] [OWNER] [LOCATION]
   ```
3. Install as LaunchDaemon (see AGENT_INSTALLATION_GUIDE.md)

## Default Values

- API_URL: `https://v0-project1-r9.vercel.app`
- DEVICE_NAME: Hostname
- OWNER: Current username
- LOCATION: "Office"

## Agent Features

All agents:
- ✅ Register device once (stores device_id locally)
- ✅ Run in background continuously
- ✅ Collect overall system logs
- ✅ Monitor USB devices
- ✅ Send events to API every 30 seconds
- ✅ Update device status

## Logs

- Windows: `%APPDATA%\CyArtAgent\agent.log`
- Linux: `~/.cyart-agent/agent.log`
- macOS: `~/.cyart-agent/agent.log`

## Device ID Storage

- Windows: `%APPDATA%\CyArtAgent\device_id.txt`
- Linux: `~/.cyart-agent/device_id.txt`
- macOS: `~/.cyart-agent/device_id.txt`

For detailed installation instructions, see `AGENT_INSTALLATION_GUIDE.md` in the project root.

