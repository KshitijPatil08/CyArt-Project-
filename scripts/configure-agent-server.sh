#!/bin/bash

# Script to configure agent to connect to server
# Usage: ./configure-agent-server.sh <API_URL> <SERVER_IP>

API_URL="${1:-https://v0-project1-r9.vercel.app}"
SERVER_IP="${2}"

echo "Configuring agent to connect to server..."
echo "API URL: $API_URL"
if [ -n "$SERVER_IP" ]; then
    echo "Server IP: $SERVER_IP"
fi

# For Linux agent
if [ -f "linux-agent.sh" ]; then
    echo "Updating linux-agent.sh..."
    sed -i "s|API_URL=\"\${1:-.*}\"|API_URL=\"\${1:-$API_URL}\"|" linux-agent.sh
    echo "✓ Linux agent configured"
fi

# For macOS agent
if [ -f "mac-agent.sh" ]; then
    echo "Updating mac-agent.sh..."
    sed -i "s|API_URL=\"\${1:-.*}\"|API_URL=\"\${1:-$API_URL}\"|" mac-agent.sh
    echo "✓ macOS agent configured"
fi

# For Windows agent (Go file)
if [ -f "windows-agent.go" ]; then
    echo "Updating windows-agent.go..."
    sed -i "s|API_URL.*=.*\"https://.*\"|API_URL        = \"$API_URL\"|" windows-agent.go
    echo "✓ Windows agent configured"
    echo ""
    echo "Recompile Windows agent:"
    echo "  go build -o CyArtAgent.exe windows-agent.go"
fi

echo ""
echo "Configuration complete!"
echo "Agents will now connect to: $API_URL"

