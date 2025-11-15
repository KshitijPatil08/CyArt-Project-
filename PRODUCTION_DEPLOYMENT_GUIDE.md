# Production Deployment Guide for CyArt Security Platform

## Overview

This guide covers deploying CyArt in a production environment with:
- ✅ Server on company infrastructure (VM or dedicated server)
- ✅ Web dashboard deployed globally (Vercel/Cloud)
- ✅ Agents on all corporate devices
- ✅ Quarantine capabilities
- ✅ Mass deployment strategies

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    PRODUCTION SETUP                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐         ┌─────────────────────┐        │
│  │  Web Dashboard │◄────────┤  Supabase Database  │        │
│  │   (Vercel)     │  API    │   (Cloud/Self-Host) │        │
│  │  Global Access │         │                     │        │
│  └────────────────┘         └─────────────────────┘        │
│         │                              ▲                    │
│         │ HTTPS                        │ PostgreSQL         │
│         ▼                              │                    │
│  ┌────────────────────────────────────────────┐            │
│  │      Company Network (VM/Server)           │            │
│  │  ┌──────────────────────────────────────┐  │            │
│  │  │   API Server (Next.js API Routes)   │  │            │
│  │  │   - Device Registration             │  │            │
│  │  │   - Log Collection                  │  │            │
│  │  │   - Quarantine Management           │  │            │
│  │  └──────────────────────────────────────┘  │            │
│  │                                            │            │
│  │  ┌──────────────────────────────────────┐  │            │
│  │  │         Agent Controller             │  │            │
│  │  │   - Auto-discovery                   │  │            │
│  │  │   - Quarantine Enforcement           │  │            │
│  │  └──────────────────────────────────────┘  │            │
│  └────────────────────────────────────────────┘            │
│         ▲         ▲         ▲                               │
│         │         │         │ Local Network                 │
│         │         │         │                               │
│  ┌──────┴──┐ ┌────┴────┐ ┌─┴──────┐                       │
│  │ Agent   │ │ Agent   │ │ Agent  │  (n devices)          │
│  │ PC-001  │ │ PC-002  │ │ PC-n   │                       │
│  └─────────┘ └─────────┘ └────────┘                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Part 1: Database Setup (Supabase)

### Option A: Supabase Cloud (Recommended for Quick Start)

1. **Create Supabase Project**
   ```bash
   # Go to https://supabase.com
   # Create new project
   # Note: URL, anon key, service_role key
   ```

2. **Run Database Migrations**
   ```sql
   -- In Supabase SQL Editor, run these files in order:
   -- 1. scripts/01-init-schema.sql
   -- 2. scripts/02-setup-auth.sql
   -- 3. scripts/03-device-credentials.sql
   -- 4. scripts/04-update-schema-usb-whitelist.sql
   ```

### Option B: Self-Hosted PostgreSQL (Enterprise)

1. **Install PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-contrib

   # Create database
   sudo -u postgres createdb cyart_production
   sudo -u postgres createuser cyart_admin -P
   ```

2. **Configure Connection**
   ```bash
   # In .env.production
   DATABASE_URL=postgresql://cyart_admin:password@localhost:5432/cyart_production
   ```

3. **Run Migrations**
   ```bash
   psql -U cyart_admin -d cyart_production -f scripts/01-init-schema.sql
   psql -U cyart_admin -d cyart_production -f scripts/02-setup-auth.sql
   psql -U cyart_admin -d cyart_production -f scripts/03-device-credentials.sql
   psql -U cyart_admin -d cyart_production -f scripts/04-update-schema-usb-whitelist.sql
   ```

---

## Part 2: Web Dashboard Deployment (Global Access)

### Deploy to Vercel (Recommended)

1. **Prepare Environment Variables**
   ```bash
   # .env.production
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_API_URL=https://your-dashboard.vercel.app
   ```

2. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   cd CyArt-Project-
   vercel --prod

   # Add environment variables in Vercel dashboard
   # Settings → Environment Variables
   ```

3. **Configure Domain** (Optional)
   ```bash
   # In Vercel dashboard
   # Settings → Domains → Add your custom domain
   # Example: security.yourcompany.com
   ```

### Alternative: Deploy to Your Own Server

1. **Build the Application**
   ```bash
   npm run build
   ```

2. **Run with PM2**
   ```bash
   npm install -g pm2
   pm2 start npm --name "cyart-dashboard" -- start
   pm2 save
   pm2 startup
   ```

3. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name security.yourcompany.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## Part 3: Local VM/Server Setup (Agent Controller)

This server runs on your company network and acts as the local hub for agents.

### Setup on Ubuntu VM

1. **Install Dependencies**
   ```bash
   sudo apt update
   sudo apt install nodejs npm nginx postgresql-client

   # Install Node.js 20+
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone and Setup Project**
   ```bash
   git clone <your-repo>
   cd CyArt-Project-
   npm install
   ```

3. **Configure Environment**
   ```bash
   # .env.local
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_API_URL=http://192.168.1.100  # Your VM IP
   ```

4. **Build and Run**
   ```bash
   npm run build
   pm2 start npm --name "cyart-server" -- start
   pm2 save
   pm2 startup
   ```

5. **Configure Firewall**
   ```bash
   # Allow API access from local network
   sudo ufw allow from 192.168.0.0/16 to any port 3000
   sudo ufw enable
   ```

6. **Setup Nginx (Optional)**
   ```nginx
   server {
       listen 80;
       server_name 192.168.1.100;

       location /api {
           proxy_pass http://localhost:3000;
       }
   }
   ```

### Setup on Windows Server

1. **Install Node.js**
   - Download from https://nodejs.org
   - Install LTS version

2. **Install Git**
   - Download from https://git-scm.com

3. **Clone and Setup**
   ```powershell
   git clone <your-repo>
   cd CyArt-Project-
   npm install
   npm run build
   ```

4. **Run as Windows Service**
   ```powershell
   # Install node-windows
   npm install -g node-windows

   # Create service script (server-service.js)
   var Service = require('node-windows').Service;

   var svc = new Service({
     name: 'CyArt Server',
     description: 'CyArt Security Monitoring Server',
     script: 'C:\\path\\to\\CyArt-Project-\\node_modules\\next\\dist\\bin\\next',
     scriptOptions: 'start'
   });

   svc.on('install', function(){
     svc.start();
   });

   svc.install();
   ```

5. **Configure Windows Firewall**
   ```powershell
   New-NetFirewallRule -DisplayName "CyArt Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

---

## Part 4: Agent Deployment (Mass Rollout)

### Build the Agent

1. **Run Build Script**
   ```powershell
   cd CyArt-Project-\scripts
   .\build-agent.ps1
   ```

   This creates:
   - `build/deployment/CyArtAgent.exe`
   - Installation scripts
   - GPO deployment scripts
   - SCCM deployment scripts

2. **Test Single Installation**
   ```powershell
   cd build\deployment
   .\install.bat  # Run as Administrator
   ```

3. **Verify Installation**
   ```powershell
   # Check service
   sc query CyArtAgent

   # View logs
   notepad %APPDATA%\CyArtAgent\agent.log
   ```

### Mass Deployment Options

#### Option 1: Group Policy (Active Directory)

1. **Prepare Network Share**
   ```powershell
   # Create share on domain controller or file server
   New-Item -ItemType Directory -Path "C:\IT\CyArtAgent"
   Copy-Item ".\CyArtAgent.exe" -Destination "C:\IT\CyArtAgent\"

   # Share the folder
   New-SmbShare -Name "CyArtAgent" -Path "C:\IT\CyArtAgent" -ReadAccess "Domain Computers"
   ```

2. **Edit GPO Script**
   - Edit `gpo-deploy.ps1`
   - Update `$NETWORK_SHARE = "\\your-dc\CyArtAgent"`

3. **Create GPO**
   ```
   Group Policy Management Console:
   1. Create new GPO: "CyArt Agent Deployment"
   2. Edit GPO
   3. Computer Configuration → Policies → Windows Settings → Scripts
   4. Startup Scripts → PowerShell Scripts → Add
   5. Browse to gpo-deploy.ps1
   6. Link GPO to target OU
   ```

4. **Force Update**
   ```powershell
   # On target machines
   gpupdate /force
   # Or reboot machines
   ```

#### Option 2: SCCM/ConfigMgr

1. **Create Application**
   - SCCM Console → Software Library → Applications
   - Create Application → Manually specify
   - Name: "CyArt Security Agent"

2. **Add Deployment Type**
   - Type: Script Installer
   - Content location: Path to CyArtAgent.exe
   - Install command: `powershell -ExecutionPolicy Bypass -File sccm-install.ps1`
   - Uninstall command: `sc delete CyArtAgent`

3. **Detection Method**
   - Type: Custom
   - Script: PowerShell
   ```powershell
   $service = Get-Service -Name "CyArtAgent" -ErrorAction SilentlyContinue
   if ($service) { Write-Host "Installed" }
   ```

4. **Deploy to Collection**
   - Right-click application → Deploy
   - Select target collection
   - Purpose: Required
   - Schedule: ASAP

#### Option 3: Remote PowerShell

```powershell
# Deploy to specific computers
$computers = @("PC001", "PC002", "PC003")

foreach ($computer in $computers) {
    # Copy installer
    Copy-Item ".\CyArtAgent.exe" -Destination "\\$computer\C$\Temp\"
    
    # Run installer remotely
    Invoke-Command -ComputerName $computer -ScriptBlock {
        Start-Process -FilePath "C:\Temp\install.bat" -Wait
    }
}
```

#### Option 4: Intune/MDM

1. **Package as Win32 App**
   ```powershell
   # Install Microsoft Win32 Content Prep Tool
   # Create .intunewin package
   IntuneWinAppUtil.exe -c ".\deployment" -s "CyArtAgent.exe" -o ".\intune"
   ```

2. **Upload to Intune**
   - Microsoft Endpoint Manager → Apps → Windows
   - Add → Windows app (Win32)
   - Upload .intunewin file

3. **Configure**
   - Install command: `install.bat`
   - Uninstall command: `uninstall.bat`
   - Detection rules: Service "CyArtAgent" exists

4. **Assign to Groups**
   - Assignments → Add all devices/users

---

## Part 5: Quarantine Functionality

### How Quarantine Works

When a device is quarantined from the dashboard:

1. **Admin Action** (via Dashboard)
   ```
   Device Management → Select Device → Quarantine
   Reason: "Suspicious USB activity detected"
   ```

2. **Server Updates Database**
   - Sets `is_quarantined = true`
   - Records reason and timestamp
   - Creates critical alert

3. **Agent Detects Quarantine** (within 10 seconds)
   - Checks quarantine status every 10 seconds
   - Receives quarantine command

4. **Agent Enforces Quarantine**
   - Disables all network adapters (except loopback)
   - Blocks USB storage devices via registry
   - Displays warning message to user
   - Continues checking for release

5. **Admin Releases Device**
   ```
   Device Management → Select Device → Release from Quarantine
   ```

6. **Agent Releases Quarantine**
   - Re-enables network adapters
   - Unblocks USB storage
   - Resumes normal operation

### Testing Quarantine

1. **Quarantine a Device**
   ```bash
   # Via API
   curl -X PUT http://your-server/api/devices/quarantine \
     -H "Content-Type: application/json" \
     -d '{
       "device_id": "uuid-here",
       "reason": "Test quarantine",
       "quarantined_by": "admin@company.com"
     }'
   ```

2. **Verify on Device**
   - Network should be disabled within 10 seconds
   - User sees warning message
   - Logs show quarantine enforcement

3. **Release Device**
   ```bash
   curl -X DELETE http://your-server/api/devices/quarantine \
     -H "Content-Type: application/json" \
     -d '{
       "device_id": "uuid-here",
       "released_by": "admin@company.com"
     }'
   ```

---

## Part 6: Production Best Practices

### Security

1. **Use HTTPS**
   ```bash
   # Let's Encrypt for free SSL
   sudo apt install certbot
   sudo certbot --nginx -d security.yourcompany.com
   ```

2. **Secure Database**
   - Use strong passwords
   - Enable SSL connections
   - Restrict access by IP
   - Regular backups

3. **API Authentication**
   - Implement API keys for agents
   - Use JWT tokens for dashboard
   - Rate limiting

4. **Network Segmentation**
   - Agents on corporate network
   - Database in secure zone
   - Dashboard accessible externally

### Monitoring

1. **Server Health**
   ```bash
   # Install monitoring
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   pm2 set pm2-logrotate:retain 7
   ```

2. **Database Monitoring**
   - Enable query logging
   - Monitor connection pool
   - Set up alerts for failures

3. **Agent Health**
   - Monitor last_seen timestamps
   - Alert on offline devices
   - Track agent versions

### Maintenance

1. **Regular Updates**
   ```bash
   # Update dashboard
   git pull
   npm install
   npm run build
   pm2 restart cyart-server
   ```

2. **Agent Updates**
   - Build new version
   - Deploy via GPO/SCCM
   - Monitor rollout

3. **Database Backups**
   ```bash
   # Automated daily backups
   pg_dump cyart_production > backup_$(date +%Y%m%d).sql
   ```

### Scaling

1. **Database Optimization**
   - Add indexes for frequent queries
   - Partition logs table by date
   - Archive old data

2. **Load Balancing**
   - Multiple API servers
   - Nginx load balancer
   - Database read replicas

3. **Caching**
   - Redis for session data
   - Cache device lists
   - Cache recent logs

---

## Part 7: Troubleshooting

### Agents Not Connecting

1. **Check Network**
   ```powershell
   Test-NetConnection -ComputerName 192.168.1.100 -Port 3000
   ```

2. **Verify Server URL**
   ```powershell
   notepad %APPDATA%\CyArtAgent\agent.config
   ```

3. **Check Firewall**
   ```powershell
   Get-NetFirewallRule -DisplayName "CyArt*"
   ```

### Quarantine Not Working

1. **Check Agent Logs**
   ```powershell
   notepad %APPDATA%\CyArtAgent\agent.log
   ```

2. **Verify API Endpoint**
   ```bash
   curl http://your-server/api/devices/quarantine/status?device_id=xxx
   ```

3. **Check Permissions**
   - Agent must run as Administrator
   - Service account needs network admin rights

### Performance Issues

1. **Database Queries**
   ```sql
   -- Check slow queries
   SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
   ```

2. **Server Resources**
   ```bash
   pm2 monit
   htop
   ```

3. **Network Latency**
   ```bash
   ping 192.168.1.100
   traceroute 192.168.1.100
   ```

---

## Summary Checklist

### Pre-Deployment
- [ ] Database setup (Supabase or PostgreSQL)
- [ ] Run all SQL migrations
- [ ] Dashboard deployed (Vercel or self-hosted)
- [ ] Local server VM configured
- [ ] Network connectivity verified

### Agent Deployment
- [ ] Build agent executable
- [ ] Test on single machine
- [ ] Prepare deployment method (GPO/SCCM/MDM)
- [ ] Create network share (if using GPO)
- [ ] Deploy to pilot group
- [ ] Monitor pilot deployment
- [ ] Roll out to all devices

### Post-Deployment
- [ ] Verify all devices registered
- [ ] Test quarantine functionality
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Document for IT team
- [ ] Train administrators

---

## Support Resources

### Documentation
- API Endpoints: `/docs/api.md`
- Agent Configuration: `/docs/agent-config.md`
- Database Schema: `scripts/01-init-schema.sql`

### Monitoring
- Dashboard: https://your-dashboard.vercel.app
- Agent Logs: `%APPDATA%\CyArtAgent\agent.log`
- Server Logs: `pm2 logs cyart-server`

### Commands Reference
```bash
# Agent Management
sc query CyArtAgent          # Check service status
sc stop CyArtAgent           # Stop agent
sc start CyArtAgent          # Start agent
sc delete CyArtAgent         # Remove agent

# Server Management
pm2 status                   # Check server status
pm2 logs cyart-server        # View logs
pm2 restart cyart-server     # Restart server
pm2 save                     # Save configuration

# Database
psql -U cyart_admin -d cyart_production  # Connect to DB
```

---

**Production Deployment Complete!**

Your CyArt Security Platform is now ready for enterprise use with:
- ✅ Global dashboard access
- ✅ Local server for agent communication
- ✅ Mass agent deployment
- ✅ Remote quarantine capabilities
- ✅ Scalable architecture
