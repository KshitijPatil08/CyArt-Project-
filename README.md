# CyArt Security Suite

CyArt is a comprehensive endpoint security management system designed for enterprise environments. It provides real-time monitoring, device management, USB control policies, software auditing, and network topology discovery.

## Features

- **Device Management**: Monitor online/offline status, hardware details, and quarantine compromised devices.
- **USB Control**: Whitelist USB devices, enforce read-only policies, set data limits, and block unauthorized storage.
- **Software Auditing**: Detect and block unverified or outdated software installations.
- **Network Topology**: Auto-discover network infrastructure (LLDP/SNMP) and visualize connections.
- **Alerts & Logging**: Centralized logging for security events, system changes, and policy violations.
- **Secure Architecture**: Authenticated agent communication and robust role-based access control.

## Prerequisites

- **Frontend/Backend**: 
  - Node.js 18+
  - Supabase Project (Database & Auth)
- **Agent**:
  - Windows 10/11 (Administrator privileges required)
  - Go 1.21+ (for building from source)

## Quick Start (Development)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/cyart-project.git
    cd cyart-project
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    - Copy `.env.local.example` to `.env.local`.
    - Fill in Supabase credentials and generate a strong `AGENT_SECRET_KEY`.

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

5.  **Build & Run Agent**:
    - Build the agent using `scripts/build-agent.ps1`.
    - Run `CyArtAgent.exe` as Administrator.

## Documentation

- [Deployment Guide](DEPLOYMENT.md): Instructions for production deployment.
- [Architecture](ARCHITECTURE.md): System design and component interaction.
- [User Guide](USER_GUIDE.md): Manual for standard users.
- [Admin Guide](ADMIN_GUIDE.md): Manual for administrators.
