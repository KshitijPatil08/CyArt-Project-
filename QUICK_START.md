# Quick Start Guide

## 1. Initial Server Setup (Ubuntu)
First, clean any existing installations and update the system:

\`\`\`bash
# Remove any existing Wazuh packages
sudo apt-get remove --purge wazuh-manager wazuh-indexer wazuh-dashboard
sudo apt-get autoremove
sudo rm -rf /var/ossec/

# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install prerequisites
sudo apt-get install curl gnupg2 apt-transport-https lsb-release -y

# Add Wazuh repository
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
sudo chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee /etc/apt/sources.list.d/wazuh.list

# Update package list
sudo apt-get update
\`\`\`

## 2. Install Wazuh Manager
The Wazuh manager now includes the API component. Install and verify:

\`\`\`bash
# Install Wazuh manager (includes the API)
sudo apt-get install wazuh-manager -y

# Wait a few moments, then check status
sudo systemctl status wazuh-manager
sudo systemctl status wazuh-manager-api

# Enable services on boot
sudo systemctl enable wazuh-manager
sudo systemctl enable wazuh-manager-api

# Verify installation
sudo cat /var/ossec/logs/ossec.log

# Configure API CORS and Security Settings
sudo nano /var/ossec/api/configuration/api.yaml

# Add these lines under the configuration:
host: 0.0.0.0
port: 55000
cors:
  enabled: yes
  source_route: '*'
  expose_headers: '*'
  allow_headers: '*'
  allow_credentials: true
https:
  enabled: false  # Set to true for production with proper certificates
  key: /var/ossec/api/configuration/ssl/server.key
  cert: /var/ossec/api/configuration/ssl/server.crt
  use_ca: false
basic_auth: true  # Enables user authentication

# 3. Configure Firewall
Set up UFW firewall to allow required ports:

\`\`\`bash
# Install UFW if not installed
sudo apt-get install ufw -y

# Allow SSH (important - do this first!)
sudo ufw allow 22/tcp

# Allow Wazuh ports
sudo ufw allow 1514/tcp  # Agent connection service
sudo ufw allow 1515/tcp  # Agent enrollment service
sudo ufw allow 55000/tcp # Wazuh API

# Enable firewall
sudo ufw enable
sudo ufw status
\`\`\`

## 4. Configure API Access
Set up API user and get credentials:

\`\`\`bash
# Create API user (default credentials are wazuh:wazuh)
sudo /var/ossec/api/scripts/create-user.sh

# Get your server IP
echo "Your Wazuh server IP: $(hostname -I | awk '{print $1}')"
echo "API Port: 55000"

# Test API access (replace credentials if you changed them)
curl -k -X GET "https://localhost:55000/security/user/authenticate" \
  -H "Authorization: Basic $(echo -n 'wazuh:wazuh' | base64)"

# Restart services to apply all changes
sudo systemctl restart wazuh-manager
sudo systemctl restart wazuh-manager-api
\`\`\`

## 5. Configure USB Device Detection
Set up USB monitoring rules:

\`\`\`bash
# Create rules directory and file
sudo mkdir -p /var/ossec/etc/rules
sudo nano /var/ossec/etc/rules/local_rules.xml
\`\`\`

Add this content to `local_rules.xml`:
\`\`\`xml
<!-- Local rules for USB device detection -->
<group name="usb,">
  <rule id="140123" level="5">
    <if_sid>1002</if_sid>
    <match>USB Mass Storage device detected</match>
    <description>USB storage device connected</description>
    <group>usb_detection,</group>
  </rule>

  <rule id="140124" level="3">
    <if_sid>1002</if_sid>
    <match>New USB device</match>
    <description>New USB device detected</description>
    <group>usb_detection,</group>
  </rule>
</group>
\`\`\`

Update Wazuh manager configuration:
\`\`\`bash
sudo nano /var/ossec/etc/ossec.conf
\`\`\`

Add this under `<ossec_config>`:
\`\`\`xml
  <!-- USB Detection -->
  <syscheck>
    <directories check_all="yes">/dev</directories>
    <directories check_all="yes">/sys/block</directories>
    
    <!-- Monitor USB mount points -->
    <directories check_all="yes">/media</directories>
    <directories check_all="yes">/mnt</directories>
    
    <!-- Quick change detection -->
    <scan_time>300</scan_time>
    <scan_day>yes</scan_day>
    <auto_ignore>no</auto_ignore>
    
    <!-- Real-time for USB events -->
    <realtime>
      <directories check_all="yes">/dev</directories>
      <directories check_all="yes">/sys/block</directories>
    </realtime>
  </syscheck>
\`\`\`

Restart Wazuh one final time:
\`\`\`bash
sudo systemctl restart wazuh-manager
\`\`\`

## 6. Project Setup

### Backend Setup
\`\`\`bash
# 1. Go to backend directory
cd backend

# 2. Copy example environment file
cp .env.example .env

# 3. Edit .env file with your Wazuh details
# Replace these values:
# WAZUH_API_URL=https://YOUR_UBUNTU_SERVER_IP:55000
# WAZUH_API_USER=your_username
# WAZUH_API_PASSWORD=your_password

# 4. Install dependencies
npm install

# 5. Start backend server
npm start
\`\`\`

### Frontend Setup
\`\`\`bash
# 1. Open new terminal
# 2. Go to frontend directory
cd frontend

# 3. Install dependencies
npm install

# 4. Start frontend
npm run dev
\`\`\`

## 3. Access the Application
- Open your browser and go to: http://localhost:5173/devices

## Common Issues & Solutions

### 1. CORS Errors
If you see CORS errors in browser console:
- Make sure you added CORS configuration to Wazuh API
- Restart Wazuh services after configuration changes

### 2. Connection Refused
If backend can't connect to Wazuh:
- Check if Wazuh API is running: `sudo systemctl status wazuh-api`
- Verify your Ubuntu server's firewall allows port 55000
- Make sure the IP address in .env is correct

### 3. Authentication Failed
If you see auth errors:
- Verify Wazuh API credentials in .env file
- Try to login to Wazuh web interface to confirm credentials

### 4. Node.js Errors
If npm commands fail:
- Make sure Node.js is installed: `node --version`
- Should be v16 or higher
- Try deleting node_modules and running npm install again

## Need Help?
- Check the full README.md for detailed documentation
- Contact: [Your Contact Info]
