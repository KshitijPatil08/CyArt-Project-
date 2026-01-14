# Deployment Guide

This guide details the steps to deploy the CyArt Security Suite in a production environment.

## 1. Web Application Deployment

The web dashboard (Next.js) can be deployed to Vercel, Netlify, or a VPS/Docker container.

### Environment Variables

Ensure the following variables are set in your production environment (`.env.local`):

```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
ALLOWED_ORIGINS=https://your-production-domain.com

# Security (CRITICAL)
# Generate a strong, random string (e.g., "openssl rand -hex 32")
AGENT_SECRET_KEY=your-secret-agent-key-here
```

## 2. Windows Agent Deployment

The Windows Agent must be built and distributed to endpoint devices.

### Building the Agent

1.  Open PowerShell as Administrator.
2.  Navigate to the project root.
3.  Run the build script:
    ```powershell
    .\scripts\build-agent.ps1
    ```
    This will compile `scripts/windows-agent-production.go` into `CyArtAgent.exe` inside the `dist` folder.

### Configuration

The agent requires the server URL and the secret key to communicate secure.

**Option A: Environment Variables (Recommended for mass deployment via GPO/MDM)**
Set the following System Environment Variables on the target machine:
- `CYART_API_URL`: `https://your-production-domain.com`
- `CYART_AGENT_KEY`: The same `AGENT_SECRET_KEY` from your server.

**Option B: Config File**
Create a file named `agent.config` in the same directory as the executable (or `C:\ProgramData\CyArtAgent\agent.config`):
```json
{
  "server_url": "https://your-production-domain.com",
  "agent_key": "your-secret-agent-key-here"
}
```

### Installation

1.  Copy `CyArtAgent.exe` and `install.bat` to the target machine.
2.  Run `install.bat` as Administrator.
3.  Verify the service is running: `Get-Service CyArtAgent`.
