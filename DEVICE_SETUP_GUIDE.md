# Device Connection and Monitoring Setup Guide

This guide explains how to connect devices (Windows/Linux computers) to the CyArt monitoring system and track peripheral devices, logs, and security events.

## Overview

The CyArt system allows you to:
- Register and manage connected devices (Windows, Linux, Mac)
- Monitor USB/peripheral device insertion and ejection
- Track data transfers and file access
- Collect and analyze system, security, and application logs
- Receive real-time alerts for security events

## Architecture

\`\`\`
Device Agent (Windows/Linux)
    ↓
API Endpoints (/api/devices/*, /api/logs/*)
    ↓
Supabase Database
    ↓
Dashboard (Device Management, Logs Viewer, Real-time Alerts)
\`\`\`

## Step 1: Register a Device

### Via Dashboard

1. Go to **Devices** page
2. Click **Register Device** button
3. Fill in the device details:
   - **Device Name**: e.g., "Office PC 1"
   - **Device Type**: Windows, Linux, or Mac
   - **Hostname**: Computer hostname (e.g., OFFICE-PC-01)
   - **Owner**: Device owner name
   - **Location**: Physical location
   - **IP Address**: Device IP address
4. Click **Register Device**
5. View and copy the generated credentials (Username & Password)

## Step 2: Install and Configure Device Agent

### For Windows

1. Download the Windows agent script: `scripts/windows-agent.ps1`
2. Open PowerShell as Administrator
3. Run the script with your API URL:
   ```powershell
   .\windows-agent.ps1 -ApiUrl "https://your-app.vercel.app" -DeviceName "Office PC 1"
   \`\`\`
4. The agent will:
   - Register the device automatically
   - Start monitoring USB devices
   - Collect system and security logs
   - Send data to the API every 30 seconds

### For Linux

1. Download the Linux agent script: `scripts/linux-agent.sh`
2. Make it executable:
   \`\`\`bash
   chmod +x linux-agent.sh
   \`\`\`
3. Run the script:
   \`\`\`bash
   ./linux-agent.sh --api-url "https://your-app.vercel.app" --device-name "Linux Server 1"
   \`\`\`
4. To run as a service, create a systemd unit file:
   \`\`\`bash
   sudo nano /etc/systemd/system/cyart-agent.service
   \`\`\`
   Add:
   \`\`\`ini
   [Unit]
   Description=CyArt Device Agent
   After=network.target

   [Service]
   Type=simple
   User=root
   ExecStart=/path/to/linux-agent.sh --api-url "https://your-app.vercel.app"
   Restart=always

   [Install]
   WantedBy=multi-user.target
   \`\`\`
   Then enable and start:
   \`\`\`bash
   sudo systemctl enable cyart-agent
   sudo systemctl start cyart-agent
   \`\`\`

## Step 3: Monitor Devices and Logs

### Device Management Page

- View all registered devices
- Check device status (online/offline)
- View device credentials
- Delete devices

### Alert Logs Page

- View all system, security, and USB logs
- Filter by:
  - Device
  - Log Type (Security, USB, System, Application, Network)
  - Severity (Critical, Error, Warning, Info, Debug)
  - Search by message
- Export logs as CSV
- Pagination support

### Real-time Alerts

- Floating alert bell icon shows unread alerts
- Click to view active alerts
- Mark alerts as read
- Resolve alerts
- Critical alerts trigger toast notifications

## API Endpoints

### Device Registration
\`\`\`
POST /api/devices/register
Body: {
  device_name: string,
  device_type: "windows" | "linux" | "mac",
  owner: string,
  location: string,
  ip_address: string,
  hostname: string,
  os_version: string,
  agent_version: string
}
\`\`\`

### Device Authentication
\`\`\`
POST /api/devices/auth
Body: {
  username: string,
  password: string
}
Response: {
  device_id: string,
  device_name: string,
  token: string
}
\`\`\`

### Send Logs
\`\`\`
POST /api/logs
Body: {
  device_id: string,
  log_type: "system" | "security" | "application" | "usb" | "network",
  source: string,
  severity: "debug" | "info" | "warning" | "error" | "critical",
  message: string,
  event_code?: string,
  timestamp: ISO8601 string,
  raw_data?: object
}
\`\`\`

### USB Device Events
\`\`\`
POST /api/devices/usb
Body: {
  device_id: string,
  usb_name: string,
  device_type: string,
  action: "insert" | "remove",
  serial_number: string,
  data_transferred_mb?: number
}
\`\`\`

### Update Device Status
\`\`\`
POST /api/devices/status
Body: {
  device_id: string,
  status: "online" | "offline" | "error",
  security_status: "secure" | "warning" | "critical" | "unknown"
}
\`\`\`

### Search Logs
\`\`\`
GET /api/logs/search?device_id=xxx&log_type=security&severity=critical&limit=50&offset=0
\`\`\`

## Database Schema

### devices
- id (UUID)
- device_name (TEXT)
- device_type (windows/linux/mac)
- owner (TEXT)
- location (TEXT)
- ip_address (TEXT)
- hostname (TEXT)
- os_version (TEXT)
- status (online/offline/error)
- security_status (secure/warning/critical/unknown)
- last_seen (TIMESTAMP)

### usb_devices
- id (UUID)
- device_id (FK to devices)
- usb_name (TEXT)
- device_type (usb_drive/printer/mouse/keyboard/external_drive/other)
- insertion_time (TIMESTAMP)
- removal_time (TIMESTAMP)
- status (connected/disconnected)
- data_transferred_mb (FLOAT)

### logs
- id (UUID)
- device_id (FK to devices)
- log_type (system/security/application/usb/network)
- source (TEXT)
- severity (debug/info/warning/error/critical)
- message (TEXT)
- timestamp (TIMESTAMP)
- raw_data (JSONB)

### alerts
- id (UUID)
- device_id (FK to devices)
- alert_type (usb_connection/security_event/suspicious_activity/offline)
- severity (low/medium/high/critical)
- title (TEXT)
- description (TEXT)
- is_read (BOOLEAN)
- is_resolved (BOOLEAN)

### device_credentials
- id (UUID)
- device_id (FK to devices)
- username (TEXT)
- password (TEXT)

## Troubleshooting

### Device shows as offline
- Check if the agent is running
- Verify the API URL is correct
- Check network connectivity
- Review agent logs

### No logs appearing
- Ensure the device is registered
- Check if the agent is running
- Verify the device_id is correct
- Check API endpoint responses

### USB devices not detected
- Ensure USB monitoring is enabled in the agent
- Check device permissions
- Verify USB device is properly connected

## Security Considerations

- Device credentials are stored securely in the database
- Use HTTPS for all API communications
- Implement rate limiting on API endpoints
- Regularly rotate device credentials
- Enable Row Level Security (RLS) on all database tables
- Monitor for suspicious activity patterns

## Support

For issues or questions, please refer to the project documentation or contact the development team.
