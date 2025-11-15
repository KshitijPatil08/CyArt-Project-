# Server Deployment Guide - Ubuntu 24.04.3

Complete guide to deploy the Next.js application on your Ubuntu 24.04.3 server so agents can connect directly to it.

## Architecture

```
┌─────────────────────────────────┐
│   Ubuntu Server 24.04.3        │
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

## Prerequisites

- Ubuntu Server 24.04.3 (running in VM)
- Root or sudo access
- Internet connection
- Supabase credentials

## Step 1: Prepare Server

SSH into your Ubuntu server:

```bash
ssh user@your-server-ip
```

## Step 2: Run Deployment Script

1. **Copy the deployment script to your server:**

   From your local machine:
   ```bash
   scp scripts/deploy-server.sh user@your-server:/tmp/
   ```

2. **Make it executable and run:**

   On the server:
   ```bash
   chmod +x /tmp/deploy-server.sh
   sudo /tmp/deploy-server.sh
   ```

   Or if you have the project on the server:
   ```bash
   cd /path/to/CyArt-Project-
   sudo chmod +x scripts/deploy-server.sh
   sudo ./scripts/deploy-server.sh
   ```

The script will:
- ✅ Update system packages
- ✅ Install Node.js 20.x
- ✅ Install PM2 (process manager)
- ✅ Install Nginx
- ✅ Copy application files
- ✅ Install dependencies
- ✅ Build Next.js application
- ✅ Configure PM2 to run the app
- ✅ Configure Nginx reverse proxy
- ✅ Configure firewall

## Step 3: Configure Environment Variables

Edit the `.env.local` file:

```bash
sudo nano /opt/cyart-server/.env.local
```

Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3000
PORT=3000
NODE_ENV=production
```

Replace:
- `YOUR_SERVER_IP` with your server's IP address (get it with `hostname -I`)

## Step 4: Restart Application

```bash
pm2 restart cyart-server
pm2 save
```

## Step 5: Verify Server is Running

```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs cyart-server

# Test API endpoint
curl http://localhost:3000/api/devices/list

# Test from outside (replace with your server IP)
curl http://YOUR_SERVER_IP/api/devices/list
```

## Step 6: Register Server in Database

### Option A: Via Web Dashboard

1. Access your dashboard at `http://YOUR_SERVER_IP`
2. Go to Device Management
3. Register the server with:
   - Device Name: "Ubuntu Server - Main"
   - Device Type: Linux
   - Hostname: (run `hostname` on server)
   - IP Address: (run `hostname -I` on server)
   - OS Version: Ubuntu 24.04.3 LTS

### Option B: Via SQL

```sql
INSERT INTO devices (
  device_name, device_type, owner, location,
  ip_address, hostname, os_version, is_server, status, last_seen
) VALUES (
  'Ubuntu Server - Main', 'linux', 'Admin', 'Data Center',
  'YOUR_SERVER_IP', 'YOUR_HOSTNAME', 'Ubuntu 24.04.3 LTS',
  true, 'online', NOW()
);
```

## Step 7: Configure Agents

### For Windows (.exe)

**Option 1: Use Auto-Detection Version (Recommended)**

Use `windows-agent-auto.go` which auto-detects the server:

```bash
go build -o CyArtAgent.exe scripts/windows-agent-auto.go
```

The agent will:
- Auto-detect server on local network
- Save server URL to config file
- Run fully automated

**Option 2: Manual Configuration**

Edit `windows-agent.go` line 17:
```go
API_URL = "http://YOUR_SERVER_IP"
```

Then compile:
```bash
go build -o CyArtAgent.exe scripts/windows-agent.go
```

### For Linux Agents

```bash
./linux-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
```

### For macOS Agents

```bash
./mac-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
```

## Step 8: Link Agents to Server

After agents register, link them to the server:

```sql
UPDATE devices 
SET server_id = (SELECT id FROM devices WHERE is_server = true LIMIT 1)
WHERE is_server = false;
```

## Step 9: Verify Everything Works

1. **Check Dashboard:**
   - Navigate to `http://YOUR_SERVER_IP`
   - Go to Dashboard → Network Topology
   - Server should be in center
   - Agents should be connected

2. **Check Agent Logs:**
   - Windows: `%APPDATA%\CyArtAgent\agent.log`
   - Linux: `~/.cyart-agent/agent.log`
   - macOS: `~/.cyart-agent/agent.log`

3. **Check Server Logs:**
   ```bash
   pm2 logs cyart-server
   ```

## Management Commands

```bash
# View application status
pm2 status

# View logs
pm2 logs cyart-server

# Restart application
pm2 restart cyart-server

# Stop application
pm2 stop cyart-server

# Start application
pm2 start cyart-server

# View Nginx status
sudo systemctl status nginx

# Restart Nginx
sudo systemctl restart nginx

# Check firewall
sudo ufw status
```

## Troubleshooting

### Application Not Starting

```bash
# Check PM2 logs
pm2 logs cyart-server --lines 50

# Check if port 3000 is in use
sudo netstat -tulpn | grep 3000

# Check Node.js version
node --version  # Should be 20.x
```

### Agents Can't Connect

1. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 3000/tcp
   ```

2. **Test connectivity from agent:**
   ```bash
   curl http://YOUR_SERVER_IP/api/devices/list
   ```

3. **Check Nginx:**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

### Server Not in Topology

```sql
-- Check server registration
SELECT * FROM devices WHERE is_server = true;

-- Update server status
UPDATE devices SET status = 'online', last_seen = NOW() WHERE is_server = true;
```

## Auto-Start on Boot

PM2 should already be configured to start on boot. Verify:

```bash
pm2 startup
pm2 save
```

## Security Considerations

1. **Use HTTPS (Recommended):**
   - Install Certbot: `sudo apt install certbot python3-certbot-nginx`
   - Get certificate: `sudo certbot --nginx -d your-domain.com`
   - Update agents to use `https://` instead of `http://`

2. **Firewall:**
   - Only allow necessary ports
   - Consider using a VPN for agent connections

3. **Environment Variables:**
   - Keep `.env.local` secure
   - Don't commit it to version control

## Next Steps

1. ✅ Server deployed and running
2. ✅ Server registered in database
3. ✅ Agents configured to connect
4. ✅ Network topology showing connections
5. Set up USB whitelist
6. Configure alerts
7. Monitor dashboard

For agent installation, see `AGENT_INSTALLATION_GUIDE.md`.


