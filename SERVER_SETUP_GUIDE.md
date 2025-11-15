# Ubuntu 24.04.3 Server Setup Guide

This guide will help you set up your Ubuntu 24.04.3 server as a central monitoring server (NOT an agent) and configure agents to connect to it.

## Prerequisites

- Ubuntu Server 24.04.3 (running in VM)
- Root or sudo access
- Network connectivity between server and agent machines
- Supabase database access
- Your Next.js application deployed (Vercel or self-hosted)

## Architecture Overview

```
┌─────────────────────────────────┐
│   Ubuntu Server 24.04.3         │
│   ┌─────────────────────────┐  │
│   │  Next.js App (Port 3000) │  │
│   │  └─ API Endpoints        │  │
│   └─────────────────────────┘  │
│   ┌─────────────────────────┐  │
│   │  Nginx (Port 80)         │  │
│   │  └─ Reverse Proxy       │  │
│   └─────────────────────────┘  │
└──────────────┬──────────────────┘
               │
               │ HTTP/API Calls
               │
    ┌──────────┴──────────┬──────────┐
    │                     │          │
┌───▼───┐            ┌───▼───┐  ┌───▼───┐
│Agent 1│            │Agent 2│  │Agent 3│
│Windows│            │ Linux │  │  Mac  │
└───────┘            └───────┘  └───────┘
```

**Important:** 
- The server runs the Next.js application and receives data from agents
- Agents connect directly to the server's API endpoints
- The server appears in Dashboard and Network Topology as the central hub

## Step 1: Get Server Information

On your Ubuntu 24.04.3 server, run:

```bash
# Get hostname
hostname

# Get IP address
hostname -I

# Get OS version
lsb_release -d

# Example output:
# Description:    Ubuntu 24.04.3 LTS
```

Note down:
- **Hostname**: e.g., `ubuntu-server`
- **IP Address**: e.g., `192.168.1.100`
- **OS Version**: `Ubuntu 24.04.3 LTS`

## Step 2: Register Server in Database

The server needs to be registered in the database so it appears in the network topology as the central hub.

### Option A: Using the Web Dashboard

1. Navigate to the Device Management page in your dashboard
2. Click "Register Device"
3. Fill in the form:
   - **Device Name**: e.g., "Ubuntu Server - Main" or "Central Monitoring Server"
   - **Device Type**: Select "Linux"
   - **Hostname**: Your server's hostname (from Step 1)
   - **IP Address**: Your server's IP address (from Step 1)
   - **Owner**: Server administrator name
   - **Location**: e.g., "Data Center" or "VM Host"
   - **OS Version**: `Ubuntu 24.04.3 LTS`

4. After registration, note the `device_id` from the response

5. **Mark as Server** (using SQL or update in database):
   ```sql
   UPDATE devices 
   SET is_server = true 
   WHERE hostname = 'YOUR_HOSTNAME';
   ```

### Option B: Using SQL (Direct Database Access)

```sql
-- Insert server device
INSERT INTO devices (
  device_name,
  device_type,
  owner,
  location,
  ip_address,
  hostname,
  os_version,
  is_server,
  status,
  last_seen
) VALUES (
  'Ubuntu Server - Main',
  'linux',
  'Admin',
  'Data Center',
  'YOUR_SERVER_IP',  -- Replace with actual IP
  'YOUR_HOSTNAME',   -- Replace with actual hostname
  'Ubuntu 24.04.3 LTS',
  true,              -- This marks it as a server
  'online',
  NOW()
);

-- Get the device_id
SELECT id, device_name, hostname, ip_address FROM devices WHERE is_server = true;
```

**Save the `device_id`** - you'll need it to link agents to this server.

## Step 3: Configure Server Firewall

Allow incoming connections from agents:

```bash
# Enable UFW if not already enabled
sudo ufw enable

# Allow HTTP/HTTPS (for API calls from agents)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If your API is on a custom port, allow that
# sudo ufw allow YOUR_PORT/tcp

# Check firewall status
sudo ufw status
```

## Step 4: Deploy Next.js Application on Server

The server needs to run the Next.js application to receive agent connections.

### Quick Deploy (Recommended)

Run the deployment script:

```bash
sudo ./scripts/deploy-server.sh
```

This will:
- Install Node.js, PM2, Nginx
- Deploy the Next.js app
- Configure reverse proxy
- Set up auto-start on boot

### Manual Deploy

See `SERVER_DEPLOYMENT_GUIDE.md` for detailed manual deployment instructions.

### Configure Environment

Edit `/opt/cyart-server/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3000
```

Then restart:
```bash
pm2 restart cyart-server
```

## Step 5: Verify Server API is Accessible

Test that agents can reach your server's API:

```bash
# From the server itself
curl -X GET http://localhost:3000/api/devices/list

# From agent machine (replace with your server IP)
curl -X GET http://YOUR_SERVER_IP/api/devices/list
```

**Note:** Agents connect to `http://YOUR_SERVER_IP` (your Ubuntu server), not Vercel.

## Step 6: Configure Agents to Connect to Server

Agents connect directly to your Ubuntu server's IP address.

### For Windows Agents (Fully Automated - Recommended)

**Option 1: Auto-Detection Version (No Configuration Needed)**

```bash
# Compile auto-detection version
go build -o CyArtAgent.exe scripts/windows-agent-auto.go

# Run once - fully automated:
# - Auto-detects server on network
# - Registers device
# - Starts monitoring
# - Runs in background
CyArtAgent.exe
```

**Option 2: Manual Configuration**

1. Edit `scripts/windows-agent.go` line 17:
   ```go
   API_URL = "http://YOUR_SERVER_IP"  // Replace with your server IP
   ```

2. Compile:
   ```bash
   go build -o CyArtAgent.exe scripts/windows-agent.go
   ```

3. Run:
   ```bash
   CyArtAgent.exe
   ```

### For Linux Agents

```bash
# Run agent with server IP
./linux-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
```

### For macOS Agents

```bash
# Run agent with server IP
./mac-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
```

**Replace `YOUR_SERVER_IP` with your Ubuntu server's IP address (from `hostname -I` command)**

## Step 7: Link Agents to Server

After agents register themselves, link them to your server in the database:

```sql
-- Get your server's device_id (from Step 2)
SELECT id, device_name FROM devices WHERE is_server = true;

-- Link all agents to the server
UPDATE devices 
SET server_id = 'YOUR_SERVER_DEVICE_ID'  -- Replace with actual server device_id
WHERE is_server = false 
  AND server_id IS NULL;

-- Verify links
SELECT 
    d.device_name as agent_name,
    s.device_name as server_name
FROM devices d
LEFT JOIN devices s ON d.server_id = s.id
WHERE d.is_server = false;
```

## Step 8: Verify Network Topology

1. Navigate to your Dashboard
2. Click "Network Topology" view
3. You should see:
   - **Server node in the center** (Ubuntu Server)
   - **Agent nodes** connected to the server in a star topology
   - **Green connections** for online devices
   - **Gray connections** for offline devices

## Step 9: Server Status Monitoring

The server automatically updates its status when the Next.js app is running. You can also manually update:

```sql
UPDATE devices 
SET status = 'online', 
    last_seen = NOW() 
WHERE is_server = true;
```

Or create a simple cron job on the server to update status (see SERVER_DEPLOYMENT_GUIDE.md for details):

```bash
# Create a status update script
sudo nano /usr/local/bin/update-server-status.sh
```

Add:
```bash
#!/bin/bash
API_URL="https://v0-project1-r9.vercel.app"
SERVER_DEVICE_ID="YOUR_SERVER_DEVICE_ID"  # From Step 2

curl -X POST "$API_URL/api/devices/status" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$SERVER_DEVICE_ID\",\"status\":\"online\",\"security_status\":\"secure\"}"
```

Make executable and add to crontab:
```bash
sudo chmod +x /usr/local/bin/update-server-status.sh

# Add to crontab (runs every 5 minutes)
sudo crontab -e
# Add: */5 * * * * /usr/local/bin/update-server-status.sh
```

## Troubleshooting

### Server Not Showing in Topology

1. **Check if server is marked correctly:**
   ```sql
   SELECT id, device_name, is_server, status FROM devices WHERE is_server = true;
   ```

2. **Verify device status is 'online':**
   ```sql
   UPDATE devices SET status = 'online', last_seen = NOW() WHERE is_server = true;
   ```

3. **Check hostname matches:**
   ```sql
   SELECT hostname, device_name FROM devices WHERE is_server = true;
   ```

### Agents Not Connected to Server

1. **Check server_id on agents:**
   ```sql
   SELECT device_name, server_id FROM devices WHERE is_server = false;
   ```

2. **Manually link agents:**
   ```sql
   UPDATE devices 
   SET server_id = (SELECT id FROM devices WHERE is_server = true LIMIT 1)
   WHERE is_server = false;
   ```

### Agents Can't Reach API

1. **Test connectivity from agent machine:**
   ```bash
   # From agent machine
   curl -X GET https://v0-project1-r9.vercel.app/api/devices/list
   ```

2. **Check firewall on server:**
   ```bash
   sudo ufw status
   ```

3. **Check network connectivity:**
   ```bash
   ping YOUR_SERVER_IP
   ```

### Server Status Not Updating

Since the server doesn't run an agent, you need to manually update or use the cron job:

```sql
UPDATE devices 
SET status = 'online', last_seen = NOW() 
WHERE is_server = true;
```

## Network Topology Display

The topology will automatically:
- Show server(s) in the center
- Display agents in a circle around the server
- Connect agents to server with lines (star topology)
- Color code connections: Green (online), Gray (offline)
- Show connection labels: "Connected" or "Offline"

## Important Notes

1. **Server is NOT an agent**: The Ubuntu server is a central monitoring hub. It does NOT run the agent script.

2. **API URL**: Agents connect to your deployed API (Vercel/cloud), not directly to the server's IP.

3. **Server Registration**: The server is registered in the database to appear in topology, but it doesn't send logs like agents do.

4. **Agent Connection**: Agents send data to the API, which stores it in the database. The server appears in topology as the central hub.

## Next Steps

1. ✅ Server registered in database
2. ✅ Agents configured with API URL
3. ✅ Agents linked to server in database
4. ✅ Network topology showing server and agents
5. Set up USB whitelist (see USB Whitelist Management page)
6. Configure alert rules
7. Monitor dashboard for events

For agent installation, see `AGENT_INSTALLATION_GUIDE.md`.
