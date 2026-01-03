# CyArt Master Integration & Deployment Manual

**Version**: 8.0.0-MASTER-FULL
**Classification**: System Administrator / DevOps
**Scope**: End-to-End Deployment, Architecture, and Operations
**Date**: December 2025

---

# SECTION 1: ARCHITECTURE & SOLUTION SUMMARY
*Executive Overview of the CyArt Security Platform.*

## 1.1 The Requirements vs. Delivery
*   **Requirement**: "Server in local dedicated infrastructure (Physical), Dashboard global."
    *   **delivered**: Hybrid Architecture. Global Next.js Dashboard + Local Physical API Server.
*   **Requirement**: "Windows agent as .exe."
    *   **Delivered**: `CyArtAgent.exe` (Compiled Go binary). No external dependencies.
*   **Requirement**: "Quarantine malicious devices."
    *   **Delivered**: Kernel-level Network disabling + USB Storage blocking.

## 1.2 Architecture Diagram
```ascii
[Internet] User (Global Dashboard) -> [Cloud/Local] Database
                                             ^
                                             |
[Intranet] Physical Server (API) <-> [Intranet] Agents (PCs)
```

---
---

# SECTION 2: FILE MANIFEST & PROJECT OVERVIEW
*Identify these critical files before starting.*

### 2.1 The Backend (Server)
*   `app/` - Next.js Source Code (Dashboard UI, API Routes).
*   `middleware.ts` - Security Gatekeeper (Auth & Session Management).
*   `lib/supabase/` - Database Connection Logic.
*   `.env.local` - **CRITICAL**: Stores API Keys and Admin Secrets.

### 2.2 The Agents (Endpoints)
*   `scripts/windows-agent-production.go` - **Master Source** for Windows.
*   `scripts/linux-agent.sh` - Bash script for Linux Servers.
*   `scripts/mac-agent.sh` - Bash script for macOS Clients.

### 2.3 The Utilities
*   `scripts/build-agent.ps1` - **The Factory**. Compiles the Agent logic into an `.exe`.
*   `scripts/register-server.sh` - Registers the backend server itself as a node.
*   `scripts/usb_request_gui.ps1` - User Interface for requesting USB access from the admin.

---
---

# SECTION 3: DEPLOYMENT GUIDE (LEVEL 1 - 5)
*Follow these levels sequentially to build the infrastructure.*

## LEVEL 1: DATABASE INFRASTRUCTURE (THE BRAIN)
*You must establish the database before the server.*

### Step 1.1: Create Project
1.  Log in to Supabase (or local Postgres).
2.  Create Project: `CyArt-Production`.

### Step 1.2: Schema Initialization (Run in SQL Editor)

**Block A: The Devices Table**
```sql
CREATE TABLE public.devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    device_name TEXT,
    hostname TEXT,
    ip_address TEXT,
    mac_address TEXT,
    os_version TEXT,
    status TEXT DEFAULT 'offline',
    is_quarantined BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner TEXT,
    location TEXT
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
```

**Block B: The Logs Table**
```sql
CREATE TABLE public.logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT REFERENCES public.devices(device_id),
    log_type TEXT,
    message TEXT,
    severity TEXT, -- 'info', 'warning', 'critical'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Block C: USB Whitelist Policies**
```sql
CREATE TABLE public.authorized_usb_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    serial_number TEXT NOT NULL,
    vendor_id TEXT,
    product_id TEXT,
    name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_read_only BOOLEAN DEFAULT FALSE
);
```

### Step 1.3: API Keys
Save these securely. Server-only keys (do NOT expose to browser): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Client/public keys (safe to expose in browser): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## LEVEL 2: APPLICATION SERVER (THE BODY)
*Deploying to your Physical/Dedicated Server.*

**Prerequisites**: Ubuntu 22.04 LTS, 4 vCores, 8GB RAM.

### Step 2.1: System Prep
```bash
sudo apt update && sudo apt upgrade -y
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
# Install PM2
sudo npm install -g pm2
```
```bash
# Install Ngrok
# For VM install Server with Ngrok
sudo apt install snap ngrok
ngrok config add-authtoken <your-authtoken>
```
### Step 2.2: Code Installation
```bash
git clone https://github.com/KshitijPatil08/CyArt-Project-.git /var/www/cyart
cd /var/www/cyart
npm install --legacy-peer-deps
```

### Step 2.3: Secrets Configuration
Create `.env.local`:
```bash
nano .env.local
```
**Content**:
```env
# Server-only (do NOT expose these to the browser)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJh... (server anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJh... (service role key - server only)

# Public (browser) keys for client usage
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh... (public anon key)

ADMIN_SECRET_CODE=ChangeMeToSomethingSecure123!
CYART_Server_URL=http://your-server-ip:3000
```

### Step 2.3.1: Secret Rotation (Post-deploy)

After deploying with the new `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, rotate secrets as follows:

1. Generate new Supabase keys in the Supabase dashboard (anon and service role).
2. Add the new keys to your hosting provider's secret store as `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy the application so it picks up the new values.
4. Test critical flows (login, device registration, agent check-ins, admin pages).
5. If all good, revoke the old keys in the Supabase dashboard.

Also rotate `JWT_SECRET` and `AGENT_SECRET_KEY` when updating Supabase keys. Plan for session invalidation if you rotate `JWT_SECRET` (e.g., enforce re-login or short expiry during rotation).

Include secret rotation in regular operational runbooks and ensure only authorized operators can access the secret store.

### Step 2.4: Launch
```bash
npm run build
pm2 start npm --name "cyart-dashboard" -- start
# Build the Next.js App
npm run build

# Start the dashboard with PM2
pm2 start npm --name "cyart-dashboard" -- start

# Configure PM2 to start on system boot
pm2 startup
# IMPORTANT: Copy and paste the command generated by 'pm2 startup' into your terminal and run it.

# Save the current process list
pm2 save
```

### Step 2.5: Monitoring & Management
*Keep your server running smoothly with these commands:*
*   **Check Status**: `pm2 status` (Shows if the app is online/offline).
*   **View Logs**: `pm2 logs cyart-dashboard` (Real-time error and output logs).
*   **Restart App**: `pm2 restart cyart-dashboard`.
*   **Stop App**: `pm2 stop cyart-dashboard`.
*   **Visual Monitor**: `pm2 monit` (Dashboard for CPU/RAM usage).

*Your Dashboard is now live at `http://your-server-ip:3000`.*
pm2 save && pm2 startup
---

## LEVEL 3: THE AGENT FACTORY (MANUFACTURING)
*You must build the agent with your specific Server URL.*

**Prerequisite**: Windows 10/11 with Go installed.

### Step 3.1: Run the Factory
1.  Open PowerShell as Admin.
2.  Navigate to `CyArt-Project-\scripts`.
3.  Run: `.\build-agent.ps1`

### Step 3.2: Configuration
*   **Prompt**: "Enter Server URL"
*   **Input**: `http://YOUR-PHYSICAL-SERVER-IP:3000`
*   *Result*: The script bakes this URL into `CyArtAgent.exe`.

### Step 3.3: Collect Artifacts
Open `build/deployment`. Copys contents to USB/Network Share:
*   `CyArtAgent.exe`
*   `install.bat`
*   `gpo-deploy.ps1`

---

## LEVEL 4: ENDPOINT DEPLOYMENT (THE ROLLOUT)

### A. Windows (Manual / Pilot)
1.  Copy deployment folder to `C:\Temp`.
2.  Run `install.bat` as Admin.
3.  **Result**: Service installed. Device appears Online in Dashboard.

### B. Windows (GPO / Enterprise)
1.  Copy files to `\\DC01\NETLOGON\CyArt\`.
2.  **GPMC**: Create GPO "CyArt Agent".
3.  **Startup Script**: Add `gpo-deploy.ps1`.
4.  **Parameters**: `-ExecutionPolicy Bypass -File \\DC01\NETLOGON\CyArt\gpo-deploy.ps1`.

### C. Linux Servers
1.  Copy `linux-agent.sh`.
2.  Edit `API_URL`.
3.  Run installation commands (Section 1.2 file manifest).

---

## LEVEL 5: OPERATIONAL ADMINISTRATION
*Day-to-day usage.*

### 5.1 First Admin Creation
1.  Go to `http://server:3000/auth/admin/sign-up`.
2.  Enter Email/Password.
3.  **Admin Code**: Enter the `ADMIN_SECRET_CODE` you set in Level 2.
4.  Success.

### 5.2 USB Whitelisting
1.  **Block**: User plugs in USB. Access Denied.
2.  **Request**: User runs `USB Request Tool` -> "Request Access".
3.  **Approve**: Admin Dashboard -> USB Whitelist -> "Approve".
4.  **Unlock**: Agent unlocks that specific Serial Number.

### 5.3 Quarantine (Kill Switch)
1.  **Detect**: Suspicious activity on `HR-PC`.
2.  **Action**: Dashboard -> Devices -> **Quarantine**.
3.  **Effect**:
    *   Network Disabled.
    *   USB Disabled.
    *   Device Offline.
4.  **Restore**: Click **Release**. Agent checks heartbeat (2 mins) and restores access.

---

# SECTION 4: PHYSICAL SERVER CONFIGURATION
*For On-Premise System Deployment.*

## 4.1 Hardware Requirements
*   **Operating System**: Ubuntu 22.04 LTS (Recommended) or Windows Server 2019+.
*   **CPU**: 4 vCores or Physical Cores.
*   **RAM**: 8GB Minimum (16GB Preferred for 500+ agents).
*   **Storage**: 100GB SSD (Database + Logs).
*   **Network**: Static IP Address (e.g., `192.168.1.100`), Port 3000 Open.

## 4.2 Software Installation (Ubuntu Example)
1.  **System Updates**:
    ```bash
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y curl git unzip
    ```
2.  **Node.js Runtime (v18+)**:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    ```
3.  **Process Manager (PM2)**:
    ```bash
    sudo npm install -g pm2
    ```

## 4.3 Application Deployment
1.  **Clone Source Code**:
    ```bash
    git clone https://github.com/KshitijPatil08/CyArt-Project-.git /opt/cyart
    cd /opt/cyart
    ```
2.  **Install Dependencies**:
    ```bash
    npm install --legacy-peer-deps
    ```
3.  **Environment Variables**:
    Create the `.env.local` file:
    ```bash
    nano .env.local
    ```
    Paste the following secrets:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh... (Your Public Key)
    SUPABASE_SERVICE_ROLE_KEY=ey... (Your Private Admin Key)
    ADMIN_SECRET_CODE=MySecureAdminCode!
    ```

## 4.4 Start & Enable Service
```bash
# Build the Next.js App
npm run build

# Start with PM2
pm2 start npm --name "cyart-backend" -- start

# Save for Auto-Start on Reboot
pm2 save
pm2 startup
```

## 4.5 Firewall Rules (UFW)
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 3000/tcp # API/Dashboard
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---
**End of Master Deployment Manual**
