# Quick Start Guide

## For Ubuntu 24.04.3 Server Setup

1. **Deploy Server:**
   ```bash
   sudo ./scripts/deploy-server.sh
   ```

2. **Configure Environment:**
   ```bash
   sudo nano /opt/cyart-server/.env.local
   # Add your Supabase credentials
   ```

3. **Restart:**
   ```bash
   pm2 restart cyart-server
   ```

4. **Get Server IP:**
   ```bash
   hostname -I
   ```

5. **Register Server in Database** (via web dashboard or SQL)

## For Windows Agent (.exe)

### Fully Automated Version (Recommended)

```bash
# Compile auto-detection version
go build -o CyArtAgent.exe scripts/windows-agent-auto.go

# Run once - it will:
# - Auto-detect server on network
# - Register device
# - Start monitoring
# - Run in background
CyArtAgent.exe
```

The agent will:
- ✅ Auto-detect server IP on local network
- ✅ Save configuration automatically
- ✅ Register device once
- ✅ Run continuously in background
- ✅ No manual configuration needed

### Manual Version

1. Edit `scripts/windows-agent.go` line 17:
   ```go
   API_URL = "http://YOUR_SERVER_IP"
   ```

2. Compile:
   ```bash
   go build -o CyArtAgent.exe scripts/windows-agent.go
   ```

3. Run:
   ```bash
   CyArtAgent.exe
   ```

## For Linux/Mac Agents

```bash
./linux-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
./mac-agent.sh http://YOUR_SERVER_IP "Device Name" "Owner" "Location"
```

## Link Agents to Server

After agents register:

```sql
UPDATE devices 
SET server_id = (SELECT id FROM devices WHERE is_server = true LIMIT 1)
WHERE is_server = false;
```

## Verify

1. Check Dashboard: `http://YOUR_SERVER_IP`
2. Go to Network Topology
3. See server in center with agents connected

That's it! Everything is automated.


