# Wazuh Agent Connection Guide

## For Server Admin (Ubuntu Server with Wazuh Manager)

1. Get Server Details:
\`\`\`bash
# Get public IP of your Ubuntu server
curl ifconfig.me

# Check Wazuh manager status
sudo systemctl status wazuh-manager

# Make sure these ports are open in your firewall:
# - 1514 (agent communication)
# - 1515 (agent registration)
# - 55000 (Wazuh API)
sudo ufw allow 1514
sudo ufw allow 1515
sudo ufw allow 55000
\`\`\`

2. Generate Authentication Key for New Agent:
\`\`\`bash
# Generate a new agent key
sudo /var/ossec/bin/manage_agents -n "AGENT_NAME" -a "ANY"

# This will output something like:
# Agent key created: 001 AGENT_NAME ANY 23c6b4cf8db87c1404e557c3f5b9361cab1c8d20474a5e496bc148480963f56c
\`\`\`

## For Each Agent (Windows/Linux machines to be monitored)

### Windows Agent Setup:

1. Download Wazuh Agent:
   - Go to: https://documentation.wazuh.com/current/installation-guide/wazuh-agent/wazuh-agent-package-windows.html
   - Download the MSI installer

2. Install Wazuh Agent:
   \`\`\`powershell
   # Run in PowerShell as Administrator
   
   # Install the agent
   msiexec.exe /i wazuh-agent-4.x.x.msi /q WAZUH_MANAGER="YOUR_UBUNTU_SERVER_IP" WAZUH_REGISTRATION_SERVER="YOUR_UBUNTU_SERVER_IP" WAZUH_AGENT_NAME="WINDOWS_AGENT_NAME"
   
   # Import the authentication key
   C:\Program Files (x86)\ossec-agent\agent-auth.exe -m YOUR_UBUNTU_SERVER_IP -A AUTHENTICATION_KEY_FROM_SERVER
   
   # Start the agent
   NET START WazuhSvc
   \`\`\`

### Linux Agent Setup:

1. Install Wazuh Agent:
\`\`\`bash
# For Ubuntu/Debian
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee -a /etc/apt/sources.list.d/wazuh.list
apt-get update
apt-get install wazuh-agent
\`\`\`

2. Configure and Start Agent:
\`\`\`bash
# Configure manager IP
sudo /var/ossec/bin/agent-auth -m YOUR_UBUNTU_SERVER_IP -A AUTHENTICATION_KEY_FROM_SERVER

# Edit ossec.conf
sudo nano /var/ossec/etc/ossec.conf
# Add/modify:
# <client>
#   <server>
#     <address>YOUR_UBUNTU_SERVER_IP</address>
#   </server>
# </client>

# Start agent
sudo systemctl start wazuh-agent
sudo systemctl enable wazuh-agent
\`\`\`

## Verify Connection

### On Server:
\`\`\`bash
# List connected agents
sudo /var/ossec/bin/agent_control -l

# Check specific agent status
sudo /var/ossec/bin/agent_control -i AGENT_ID
\`\`\`

### On Agent:
\`\`\`bash
# Windows (PowerShell as Administrator)
C:\Program Files (x86)\ossec-agent\agent-auth.exe -t

# Linux
sudo /var/ossec/bin/agent-auth -t
\`\`\`

## Troubleshooting

1. Agent Not Connecting:
   - Check if server IP is correct
   - Verify ports 1514 and 1515 are open
   - Ensure authentication key is correct
   - Check agent logs:
     - Windows: `C:\Program Files (x86)\ossec-agent\ossec.log`
     - Linux: `/var/ossec/logs/ossec.log`

2. Registration Issues:
   - Make sure the agent name is unique
   - Verify the authentication key hasn't expired
   - Check server's `ossec.log` for registration attempts

3. Communication Problems:
   - Verify firewall settings on both ends
   - Check network connectivity
   - Ensure DNS resolution is working

## For Visualization Project

After connecting agents, update the `.env` file in the backend:
\`\`\`env
WAZUH_API_URL=https://YOUR_UBUNTU_SERVER_IP:55000
WAZUH_API_USER=wazuh-wui
WAZUH_API_PASSWORD=your_password_here
\`\`\`

The visualization will automatically show new agents as they connect to the Wazuh server.
