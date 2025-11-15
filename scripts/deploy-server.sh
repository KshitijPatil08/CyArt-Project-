#!/bin/bash

# Deploy Next.js Application to Ubuntu 24.04.3 Server
# This script sets up the server to receive agent connections

set -e

echo "=========================================="
echo "CyArt Server Deployment Script"
echo "Ubuntu 24.04.3 Server Setup"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Get server information
SERVER_IP=$(hostname -I | awk '{print $1}')
HOSTNAME=$(hostname)
OS_VERSION=$(lsb_release -d | cut -f2)

echo -e "${GREEN}Server Information:${NC}"
echo "  IP Address: $SERVER_IP"
echo "  Hostname: $HOSTNAME"
echo "  OS: $OS_VERSION"
echo ""

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js 20.x
echo -e "${YELLOW}Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 for process management
echo -e "${YELLOW}Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Install nginx
echo -e "${YELLOW}Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi

# Create application directory
APP_DIR="/opt/cyart-server"
echo -e "${YELLOW}Creating application directory: $APP_DIR${NC}"
mkdir -p $APP_DIR

# Copy application files (assuming script is run from project root)
echo -e "${YELLOW}Copying application files...${NC}"
if [ -d "../CyArt-Project-" ]; then
    cp -r ../CyArt-Project-/* $APP_DIR/
elif [ -d "./CyArt-Project-" ]; then
    cp -r ./CyArt-Project-/* $APP_DIR/
else
    echo -e "${RED}Error: Could not find application files${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

cd $APP_DIR

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install --production

# Build application
echo -e "${YELLOW}Building Next.js application...${NC}"
npm run build

# Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env.local" ]; then
    echo -e "${YELLOW}Creating .env.local file...${NC}"
    cat > $APP_DIR/.env.local <<EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Server Configuration
NEXT_PUBLIC_API_URL=http://$SERVER_IP:3000
PORT=3000
NODE_ENV=production
EOF
    echo -e "${YELLOW}⚠️  Please edit $APP_DIR/.env.local with your Supabase credentials${NC}"
fi

# Create PM2 ecosystem file
cat > $APP_DIR/ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'cyart-server',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '$APP_DIR',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/cyart-server/error.log',
    out_file: '/var/log/cyart-server/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G'
  }]
}
EOF

# Create log directory
mkdir -p /var/log/cyart-server

# Start application with PM2
echo -e "${YELLOW}Starting application with PM2...${NC}"
pm2 start $APP_DIR/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

# Configure Nginx reverse proxy
echo -e "${YELLOW}Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/cyart-server <<EOF
server {
    listen 80;
    server_name $SERVER_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/cyart-server /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx

# Configure firewall
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable

# Register server in database (manual step)
echo ""
echo -e "${GREEN}=========================================="
echo "Server Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Server URL: http://$SERVER_IP"
echo "API Endpoint: http://$SERVER_IP/api"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Edit $APP_DIR/.env.local with your Supabase credentials"
echo "2. Restart the application: pm2 restart cyart-server"
echo "3. Register server in database (see SERVER_SETUP_GUIDE.md)"
echo "4. Configure agents to connect to: http://$SERVER_IP"
echo ""
echo "Check application status: pm2 status"
echo "View logs: pm2 logs cyart-server"
echo ""


