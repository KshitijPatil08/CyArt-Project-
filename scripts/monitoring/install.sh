#!/bin/bash
# Universal USB Monitoring Installation Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_TYPE=""

# Detect OS
if [ "$(uname)" == "Linux" ]; then
    OS_TYPE="linux"
elif [ "$(uname)" == "Darwin" ]; then
    echo "MacOS is not supported yet"
    exit 1
elif [ -n "$WINDIR" ]; then
    OS_TYPE="windows"
fi

echo "🔍 Detected OS: $OS_TYPE"
echo "📂 Installing USB monitoring..."

install_linux() {
    # Check for root
    if [ "$EUID" -ne 0 ]; then
        echo "❌ Please run as root"
        exit 1
    }

    # Install dependencies
    echo "📦 Installing dependencies..."
    if command -v apt-get &>/dev/null; then
        apt-get update
        apt-get install -y usbutils inotify-tools
    elif command -v yum &>/dev/null; then
        yum install -y usbutils inotify-tools
    else
        echo "❌ Unsupported package manager"
        exit 1
    fi

    # Create directories
    mkdir -p /var/log/wazuh-usb
    mkdir -p /var/ossec/active-response/bin

    # Copy monitoring script
    cp "$SCRIPT_DIR/usb-monitor.sh" /var/ossec/active-response/bin/
    chmod +x /var/ossec/active-response/bin/usb-monitor.sh

    # Create systemd service
    cat > /etc/systemd/system/wazuh-usb-monitor.service << EOF
[Unit]
Description=Wazuh USB Device Monitor
After=wazuh-agent.service
Requires=wazuh-agent.service

[Service]
Type=simple
ExecStart=/var/ossec/active-response/bin/usb-monitor.sh
Restart=always
RestartSec=10
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Configure Wazuh agent
    cat >> /var/ossec/etc/ossec.conf << EOF

<!-- USB Device Monitoring -->
<localfile>
  <log_format>syslog</log_format>
  <location>/var/log/usb-devices.log</location>
</localfile>

<localfile>
  <log_format>syslog</log_format>
  <location>/var/log/wazuh-usb/usb-events.log</location>
</localfile>
EOF

    # Start services
    systemctl daemon-reload
    systemctl enable wazuh-usb-monitor
    systemctl start wazuh-usb-monitor
    systemctl restart wazuh-agent

    echo "✅ Linux installation complete!"
}

install_windows() {
    # Check for admin privileges
    NET SESSION &>/dev/null
    if [ $? -ne 0 ]; then
        echo "❌ Please run as Administrator"
        exit 1
    }

    # Create directories
    mkdir -p "/cygdrive/c/Program Files (x86)/ossec-agent/active-response/bin"
    mkdir -p "/cygdrive/c/ProgramData/ossec/logs"

    # Copy PowerShell script
    cp "$SCRIPT_DIR/usb-monitor.ps1" "/cygdrive/c/Program Files (x86)/ossec-agent/active-response/bin/"

    # Create scheduled task
    powershell.exe -Command "
        \$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File \"C:\\Program Files (x86)\\ossec-agent\\active-response\\bin\\usb-monitor.ps1\"'
        \$Trigger = New-ScheduledTaskTrigger -AtStartup
        Register-ScheduledTask -TaskName 'WazuhUSBMonitor' -Action \$Action -Trigger \$Trigger -RunLevel Highest -Force
    "

    # Add to Wazuh config
    powershell.exe -Command "
        \$config = Get-Content 'C:\\Program Files (x86)\\ossec-agent\\ossec.conf'
        \$config += '<!-- USB Device Monitoring -->'
        \$config += '<localfile>'
        \$config += '  <location>C:\\ProgramData\\ossec\\logs\\usb-devices.log</location>'
        \$config += '  <log_format>syslog</log_format>'
        \$config += '</localfile>'
        \$config | Set-Content 'C:\\Program Files (x86)\\ossec-agent\\ossec.conf'
    "

    # Start monitoring
    powershell.exe -Command "Start-ScheduledTask -TaskName 'WazuhUSBMonitor'"
    net stop WazuhSvc
    net start WazuhSvc

    echo "✅ Windows installation complete!"
}

# Main installation
if [ "$OS_TYPE" == "linux" ]; then
    install_linux
elif [ "$OS_TYPE" == "windows" ]; then
    install_windows
fi

echo "
📝 Installation Summary:
- Monitoring scripts installed
- Services/tasks configured
- Wazuh agent updated
- Logging enabled

🔍 Monitor logs at:
Linux:   tail -f /var/log/usb-devices.log
Windows: Get-Content 'C:\ProgramData\ossec\logs\usb-devices.log' -Wait

✨ Test by connecting a USB device!"
