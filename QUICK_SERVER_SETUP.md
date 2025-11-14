# Quick Server Setup - Ubuntu 24.04.3

Quick reference for setting up your Ubuntu 24.04.3 server as a central monitoring hub.

## Server Information

Get your server details:
```bash
hostname          # e.g., ubuntu-server
hostname -I       # e.g., 192.168.1.100
lsb_release -d    # Ubuntu 24.04.3 LTS
```

## 1. Register Server in Database

### Via Web Dashboard:
1. Go to Device Management
2. Register device with:
   - Device Name: "Ubuntu Server - Main"
   - Device Type: Linux
   - Hostname: (from `hostname` command)
   - IP Address: (from `hostname -I` command)
   - OS Version: Ubuntu 24.04.3 LTS

### Via SQL:
```sql
INSERT INTO devices (
  device_name, device_type, owner, location,
  ip_address, hostname, os_version, is_server, status, last_seen
) VALUES (
  'Ubuntu Server - Main', 'linux', 'Admin', 'Data Center',
  'YOUR_SERVER_IP', 'YOUR_HOSTNAME', 'Ubuntu 24.04.3 LTS',
  true, 'online', NOW()
);

-- Get server device_id
SELECT id FROM devices WHERE is_server = true;
```

## 2. Configure Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 3. Configure Agents

Agents connect to your API URL (usually Vercel deployment):

**Default API URL:** `https://v0-project1-r9.vercel.app`

### Windows:
- Edit `windows-agent.go` line 17: `API_URL = "https://v0-project1-r9.vercel.app"`
- Compile: `go build -o CyArtAgent.exe windows-agent.go`

### Linux:
```bash
./linux-agent.sh https://v0-project1-r9.vercel.app "Device Name" "Owner" "Location"
```

### macOS:
```bash
./mac-agent.sh https://v0-project1-r9.vercel.app "Device Name" "Owner" "Location"
```

## 4. Link Agents to Server

After agents register, link them:

```sql
-- Replace YOUR_SERVER_DEVICE_ID with actual ID from step 1
UPDATE devices 
SET server_id = 'YOUR_SERVER_DEVICE_ID'
WHERE is_server = false;
```

## 5. Verify Topology

- Go to Dashboard → Network Topology
- Server should be in center
- Agents connected in star topology

## Important

- **Server is NOT an agent** - it's just registered in database for topology display
- **Agents connect to API URL** (Vercel), not server IP
- **Server doesn't send logs** - only agents do

## Troubleshooting

```sql
-- Check server status
SELECT * FROM devices WHERE is_server = true;

-- Check agent links
SELECT device_name, server_id FROM devices WHERE is_server = false;

-- Update server status
UPDATE devices SET status = 'online', last_seen = NOW() WHERE is_server = true;
```

For detailed setup, see `SERVER_SETUP_GUIDE.md`.

