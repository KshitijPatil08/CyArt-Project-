# Server Setup Guide for Network Topology

This guide will help you set up your Ubuntu server and configure it to appear in the network topology dashboard.

## Prerequisites

- Ubuntu Server (20.04 or later)
- Root or sudo access
- Network connectivity to your agents
- Supabase database access

## Step 1: Register Server in Database

### Option A: Using the Web Dashboard

1. Navigate to the Device Management page
2. Click "Register Device"
3. Fill in the form:
   - **Device Name**: e.g., "Ubuntu Server - Main"
   - **Device Type**: Select "Linux" or manually set to "server"
   - **Hostname**: Your server's hostname (run `hostname` on server)
   - **IP Address**: Your server's IP address (run `hostname -I` on server)
   - **Owner**: Server administrator name
   - **Location**: e.g., "Data Center" or "Office"
   - **OS Version**: Run `lsb_release -d` on server to get version

4. After registration, note the `device_id` from the response

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
  'YOUR_SERVER_IP',
  'YOUR_HOSTNAME',
  'Ubuntu 22.04',
  true,
  'online',
  NOW()
);

-- Get the device_id
SELECT id, device_name FROM devices WHERE is_server = true;
```

## Step 2: Update Agent Devices to Link to Server

After registering your server, you need to link your agent devices to the server:

```sql
-- Get server device_id (replace with your server's device_id)
UPDATE devices 
SET server_id = 'YOUR_SERVER_DEVICE_ID'
WHERE is_server = false 
  AND server_id IS NULL;
```

Or update individual agents:

```sql
UPDATE devices 
SET server_id = 'YOUR_SERVER_DEVICE_ID'
WHERE device_id = 'AGENT_DEVICE_ID';
```

## Step 3: Install Monitoring Agent on Server (Optional)

If you want the server to send logs and status updates:

1. Copy the Linux agent script to your server:
   ```bash
   scp scripts/linux-agent.sh user@your-server:/tmp/
   ```

2. SSH into your server:
   ```bash
   ssh user@your-server
   ```

3. Make the script executable:
   ```bash
   chmod +x /tmp/linux-agent.sh
   ```

4. Edit the script to set your API URL and device_id:
   ```bash
   nano /tmp/linux-agent.sh
   ```
   Update:
   - `API_URL` to your Vercel/deployment URL
   - `DEVICE_ID` to your server's device_id from Step 1

5. Run the agent as a systemd service:
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
   ExecStart=/path/to/linux-agent.sh
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

6. Enable and start the service:
   ```bash
   sudo systemctl enable cyart-agent
   sudo systemctl start cyart-agent
   sudo systemctl status cyart-agent
   ```

## Step 4: Verify Server in Topology

1. Navigate to the Dashboard
2. Click "Network Topology" view
3. You should see:
   - Server node in the center
   - Agent nodes connected to the server in a star topology
   - Green connections for online devices
   - Gray connections for offline devices

## Step 5: Configure Firewall (If Needed)

If your agents can't connect to the server, ensure ports are open:

```bash
# Allow HTTP/HTTPS (for API calls)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If using custom ports, allow those
sudo ufw allow YOUR_PORT/tcp
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

### Server Status Not Updating

1. **Check if agent is running:**
   ```bash
   sudo systemctl status cyart-agent
   ```

2. **Check agent logs:**
   ```bash
   sudo journalctl -u cyart-agent -f
   ```

3. **Manually update status:**
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

## Multiple Servers

If you have multiple servers:

1. Register each server with `is_server = true`
2. Agents can be linked to specific servers using `server_id`
3. The topology will show:
   - Main server in center
   - Additional servers connected to main server (dashed lines)
   - Agents connected to their respective servers

## API Endpoints for Server Management

- `GET /api/devices/list` - List all devices (servers and agents)
- `POST /api/devices/register` - Register new device
- `POST /api/devices/status` - Update device status
- `GET /api/logs?device_id=DEVICE_ID` - Get device logs

## Next Steps

1. Set up USB whitelist (see USB Whitelist Management page)
2. Configure alert rules
3. Set up automated monitoring
4. Configure backup and recovery

For more information, see the main project documentation.

