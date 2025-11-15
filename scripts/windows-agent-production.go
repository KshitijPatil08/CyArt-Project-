package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	// Server URL - Set this to your Ubuntu server's public IP or domain
	// For distributed teams: Use public IP (e.g., "http://1.2.3.4:3000")
	// Or domain (e.g., "https://server.company.com")
	DEFAULT_API_URL = " https://ariel-pseudoanthropoid-harvey.ngrok-free.dev" // CHANGE THIS
	POLL_INTERVAL   = 30 * time.Second
	CHECK_QUARANTINE_INTERVAL = 10 * time.Second
	REGISTRATION_FILE = "device_id.txt"
	LOG_FILE       = "agent.log"
	CONFIG_FILE    = "agent.config"
	VERSION        = "3.0.0-production"
)

var (
	deviceID   string
	deviceName string
	owner      string
	location   string
	apiURL     string
	agentDir   string
	isQuarantined bool = false
)

type DeviceRegistration struct {
	DeviceName string `json:"device_name"`
	DeviceType string `json:"device_type"`
	Owner      string `json:"owner"`
	Location   string `json:"location"`
	Hostname   string `json:"hostname"`
	IPAddress  string `json:"ip_address"`
	OSVersion  string `json:"os_version"`
	AgentVersion string `json:"agent_version"`
}

type LogEntry struct {
	DeviceID   string                 `json:"device_id"`
	DeviceName string                 `json:"device_name"`
	Hostname   string                 `json:"hostname"`
	LogType    string                 `json:"log_type"`
	HardwareType string               `json:"hardware_type,omitempty"`
	Event      string                 `json:"event,omitempty"`
	Source     string                 `json:"source"`
	Severity   string                 `json:"severity"`
	Message    string                 `json:"message"`
	Timestamp  string                 `json:"timestamp"`
	RawData    map[string]interface{} `json:"raw_data,omitempty"`
}

type Config struct {
	ServerURL string `json:"server_url"`
}

type QuarantineStatus struct {
	IsQuarantined   bool   `json:"is_quarantined"`
	QuarantineReason string `json:"quarantine_reason"`
	QuarantinedAt   string `json:"quarantined_at"`
	QuarantinedBy   string `json:"quarantined_by"`
}

func init() {
	// Get app data directory
	if runtime.GOOS == "windows" {
		agentDir = filepath.Join(os.Getenv("APPDATA"), "CyArtAgent")
	} else {
		agentDir = filepath.Join(os.Getenv("HOME"), ".cyart-agent")
	}
	
	os.MkdirAll(agentDir, 0755)
	
	deviceName = getHostname()
	owner = getUsername()
	location = "Office"
	
	apiURL = loadOrDetectServerURL()
	loadDeviceID()
}

func detectServer() string {
	logMessage("Auto-detecting server on local network...")
	
	commonIPs := []string{
		"192.168.1.100",
		"192.168.1.1",
		"192.168.0.100",
		"10.0.0.100",
		"172.16.0.100",
	}
	
	localIP := getLocalIP()
	if localIP != "" {
		parts := strings.Split(localIP, ".")
		if len(parts) == 4 {
			baseIP := strings.Join(parts[:3], ".")
			commonIPs = append([]string{baseIP + ".100", baseIP + ".1"}, commonIPs...)
		}
	}
	
	for _, ip := range commonIPs {
		url := fmt.Sprintf("http://%s/api/devices/list", ip)
		if testConnection(url) {
			logMessage(fmt.Sprintf("Found server at: %s", ip))
			return fmt.Sprintf("http://%s", ip)
		}
	}
	
	logMessage("Scanning local network for server...")
	if serverIP := scanNetwork(); serverIP != "" {
		return fmt.Sprintf("http://%s", serverIP)
	}
	
	logMessage("Server auto-detection failed, using default")
	return DEFAULT_API_URL
}

func scanNetwork() string {
	localIP := getLocalIP()
	if localIP == "" {
		return ""
	}
	
	parts := strings.Split(localIP, ".")
	if len(parts) != 4 {
		return ""
	}
	
	baseIP := strings.Join(parts[:3], ".")
	
	for i := 1; i <= 254; i++ {
		if i == 100 || i == 1 || i%10 == 0 {
			testIP := fmt.Sprintf("%s.%d", baseIP, i)
			url := fmt.Sprintf("http://%s/api/devices/list", testIP)
			if testConnection(url) {
				return testIP
			}
		}
	}
	
	return ""
}

func testConnection(url string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200 || resp.StatusCode == 401
}

func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func loadOrDetectServerURL() string {
	configPath := filepath.Join(agentDir, CONFIG_FILE)
	
	// Try to load from config file first
	if data, err := os.ReadFile(configPath); err == nil {
		var config Config
		if json.Unmarshal(data, &config) == nil && config.ServerURL != "" {
			logMessage(fmt.Sprintf("Loaded server URL from config: %s", config.ServerURL))
			return config.ServerURL
		}
	}
	
	// Auto-detect local server
	serverURL := detectServer()
	saveConfig(serverURL)
	
	return serverURL
}

func saveConfig(serverURL string) {
	configPath := filepath.Join(agentDir, CONFIG_FILE)
	config := Config{ServerURL: serverURL}
	data, _ := json.Marshal(config)
	os.WriteFile(configPath, data, 0644)
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "Unknown"
	}
	return hostname
}

func getUsername() string {
	return os.Getenv("USERNAME")
}

func loadDeviceID() {
	filePath := filepath.Join(agentDir, REGISTRATION_FILE)
	data, err := os.ReadFile(filePath)
	if err == nil {
		deviceID = strings.TrimSpace(string(data))
		if deviceID != "" {
			logMessage(fmt.Sprintf("Using existing device ID: %s", deviceID))
		}
	}
}

func saveDeviceID(id string) {
	filePath := filepath.Join(agentDir, REGISTRATION_FILE)
	os.WriteFile(filePath, []byte(id), 0644)
	deviceID = id
}

func logMessage(message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	
	fmt.Print(logEntry)
	
	logPath := filepath.Join(agentDir, LOG_FILE)
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		defer file.Close()
		file.WriteString(logEntry)
	}
}

func initializeDevice() error {
	if deviceID != "" {
		return nil
	}

	hostname := getHostname()
	ipAddress := getIPAddress()
	osVersion := getOSVersion()

	reg := DeviceRegistration{
		DeviceName:  deviceName,
		DeviceType:  "windows",
		Owner:       owner,
		Location:    location,
		Hostname:    hostname,
		IPAddress:   ipAddress,
		OSVersion:   osVersion,
		AgentVersion: VERSION,
	}

	jsonData, err := json.Marshal(reg)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/devices/register", apiURL)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return fmt.Errorf("failed to connect to server at %s: %v", apiURL, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if id, ok := result["device_id"].(string); ok {
		saveDeviceID(id)
		logMessage(fmt.Sprintf("Device registered: %s", id))
		return nil
	}

	return fmt.Errorf("failed to register device: %s", string(body))
}

func getIPAddress() string {
	cmd := exec.Command("ipconfig")
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if strings.Contains(line, "IPv4") {
				parts := strings.Fields(line)
				if len(parts) > 0 {
					return parts[len(parts)-1]
				}
			}
		}
	}
	return "127.0.0.1"
}

func getOSVersion() string {
	cmd := exec.Command("systeminfo")
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if strings.Contains(line, "OS Name") {
				return strings.TrimSpace(strings.Split(line, ":")[1])
			}
		}
	}
	return "Windows"
}

// Check quarantine status from server
func checkQuarantineStatus() {
	if deviceID == "" {
		return
	}

	url := fmt.Sprintf("%s/api/devices/quarantine/status?device_id=%s", apiURL, deviceID)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		logMessage(fmt.Sprintf("Error checking quarantine status: %v", err))
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var status QuarantineStatus
	if err := json.Unmarshal(body, &status); err != nil {
		return
	}

	if status.IsQuarantined && !isQuarantined {
		isQuarantined = true
		logMessage(fmt.Sprintf("⚠️  DEVICE QUARANTINED: %s", status.QuarantineReason))
		enforceQuarantine(status.QuarantineReason)
	} else if !status.IsQuarantined && isQuarantined {
		isQuarantined = false
		logMessage("✅ Device quarantine lifted")
		releaseQuarantine()
	}
}

// Enforce quarantine measures
func enforceQuarantine(reason string) {
	logMessage("Enforcing quarantine measures...")
	
	// Disable network adapters (except loopback)
	cmd := exec.Command("powershell", "-Command", 
		"Get-NetAdapter | Where-Object {$_.InterfaceDescription -notlike '*Loopback*'} | Disable-NetAdapter -Confirm:$false")
	if err := cmd.Run(); err != nil {
		logMessage(fmt.Sprintf("Warning: Could not disable network adapters: %v", err))
	}
	
	// Block USB storage devices
	blockUSBStorage()
	
	// Display warning to user
	showQuarantineWarning(reason)
	
	logMessage("Quarantine measures enforced")
}

// Release quarantine
func releaseQuarantine() {
	logMessage("Releasing quarantine measures...")
	
	// Re-enable network adapters
	cmd := exec.Command("powershell", "-Command", 
		"Get-NetAdapter | Enable-NetAdapter -Confirm:$false")
	if err := cmd.Run(); err != nil {
		logMessage(fmt.Sprintf("Warning: Could not re-enable network adapters: %v", err))
	}
	
	// Unblock USB storage devices
	unblockUSBStorage()
	
	logMessage("Quarantine measures released")
}

func blockUSBStorage() {
	// Set registry to block USB storage
	cmd := exec.Command("reg", "add", 
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR", 
		"/v", "Start", "/t", "REG_DWORD", "/d", "4", "/f")
	cmd.Run()
}

func unblockUSBStorage() {
	// Set registry to allow USB storage
	cmd := exec.Command("reg", "add", 
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR", 
		"/v", "Start", "/t", "REG_DWORD", "/d", "3", "/f")
	cmd.Run()
}

func showQuarantineWarning(reason string) {
	message := fmt.Sprintf("⚠️ SECURITY ALERT ⚠️\n\nThis device has been quarantined by IT Security.\n\nReason: %s\n\nNetwork access has been restricted.\nPlease contact your IT administrator immediately.", reason)
	
	cmd := exec.Command("msg", "*", message)
	cmd.Run()
}

func trackUSBDevices() {
	if deviceID == "" || isQuarantined {
		return
	}

	cmd := exec.Command("powershell", "-Command", 
		"Get-WmiObject Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like '*USBSTOR*' -or $_.PNPDeviceID -like '*USB\\VID_*' } | Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress")
	
	output, err := cmd.Output()
	if err != nil {
		return
	}

	var usbDevices []map[string]interface{}
	if err := json.Unmarshal(output, &usbDevices); err != nil {
		var singleDevice map[string]interface{}
		if err2 := json.Unmarshal(output, &singleDevice); err2 == nil {
			usbDevices = []map[string]interface{}{singleDevice}
		} else {
			return
		}
	}

	hostname := getHostname()
	timestamp := time.Now().UTC().Format(time.RFC3339)
	
	for _, device := range usbDevices {
		deviceName := "Unknown USB Device"
		if name, ok := device["Name"].(string); ok {
			deviceName = name
		}
		
		pnpID := ""
		if id, ok := device["PNPDeviceID"].(string); ok {
			pnpID = id
		}
		
		serialNumber := "UNKNOWN"
		if strings.Contains(pnpID, "\\") {
			parts := strings.Split(pnpID, "\\")
			if len(parts) > 0 {
				serialNumber = parts[len(parts)-1]
			}
		}
		
		vendorID := ""
		productID := ""
		if strings.Contains(pnpID, "VID_") {
			vidIndex := strings.Index(pnpID, "VID_")
			if vidIndex >= 0 && vidIndex+7 < len(pnpID) {
				vendorID = pnpID[vidIndex+4 : vidIndex+8]
			}
		}
		if strings.Contains(pnpID, "PID_") {
			pidIndex := strings.Index(pnpID, "PID_")
			if pidIndex >= 0 && pidIndex+7 < len(pnpID) {
				productID = pnpID[pidIndex+4 : pidIndex+8]
			}
		}
		
		rawData := map[string]interface{}{
			"usb_name":      deviceName,
			"serial_number": serialNumber,
			"vendor_id":     vendorID,
			"product_id":    productID,
			"pnp_device_id": pnpID,
		}
		
		sendLog(LogEntry{
			DeviceID:     deviceID,
			DeviceName:   deviceName,
			Hostname:     hostname,
			LogType:      "hardware",
			HardwareType: "usb",
			Event:        "connected",
			Source:       "windows-agent",
			Severity:     "info",
			Message:      fmt.Sprintf("USB device connected: %s", deviceName),
			Timestamp:    timestamp,
			RawData:      rawData,
		})
	}
}

func sendSystemLogs() {
	if deviceID == "" || isQuarantined {
		return
	}

	hostname := getHostname()
	timestamp := time.Now().UTC().Format(time.RFC3339)

	cmd := exec.Command("powershell", "-Command",
		"Get-EventLog -LogName Security -Newest 5 | Select-Object Message, EventID, EntryType, TimeGenerated | ConvertTo-Json")
	
	output, err := cmd.Output()
	if err == nil && len(output) > 0 {
		var logs []map[string]interface{}
		
		if err := json.Unmarshal(output, &logs); err != nil {
			var singleLog map[string]interface{}
			if err2 := json.Unmarshal(output, &singleLog); err2 == nil {
				logs = []map[string]interface{}{singleLog}
			} else {
				return
			}
		}

		for _, logEntry := range logs {
			severity := "info"
			if entryType, ok := logEntry["EntryType"].(string); ok {
				if entryType == "Error" {
					severity = "error"
				} else if entryType == "Warning" {
					severity = "warning"
				} else if entryType == "FailureAudit" {
					severity = "high"
				}
			}

			message := ""
			if msg, ok := logEntry["Message"].(string); ok {
				message = msg
			} else if msg, ok := logEntry["message"].(string); ok {
				message = msg
			}

			if message != "" {
				sendLog(LogEntry{
					DeviceID:   deviceID,
					DeviceName: deviceName,
					Hostname:   hostname,
					LogType:    "security",
					Source:     "Windows Event Log - Security",
					Severity:   severity,
					Message:    message,
					Timestamp:  timestamp,
				})
			}
		}
	}
}

func sendLog(logEntry LogEntry) {
	jsonData, err := json.Marshal(logEntry)
	if err != nil {
		logMessage(fmt.Sprintf("Error marshaling log: %v", err))
		return
	}

	url := fmt.Sprintf("%s/api/log", apiURL)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		logMessage(fmt.Sprintf("Error sending log: %v", err))
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		logMessage(fmt.Sprintf("Error response from API: %s", string(body)))
	}
}

func updateDeviceStatus() {
	if deviceID == "" {
		return
	}

	status := map[string]interface{}{
		"device_id":       deviceID,
		"status":          "online",
		"security_status": "secure",
	}
	
	if isQuarantined {
		status["status"] = "quarantined"
		status["security_status"] = "critical"
	}

	jsonData, err := json.Marshal(status)
	if err != nil {
		logMessage(fmt.Sprintf("Error marshaling status: %v", err))
		return
	}
	
	url := fmt.Sprintf("%s/api/devices/status", apiURL)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		logMessage(fmt.Sprintf("Error updating status: %v", err))
		return
	}
	defer resp.Body.Close()
}

func main() {
	// Check if running as administrator
	if !isAdmin() {
		logMessage("ERROR: Agent must run with administrator privileges")
		fmt.Println("Please run this agent as Administrator")
		os.Exit(1)
	}

	logMessage(fmt.Sprintf("Starting CyArt Security Agent v%s...", VERSION))
	logMessage(fmt.Sprintf("Server URL: %s", apiURL))

	if err := initializeDevice(); err != nil {
		logMessage(fmt.Sprintf("Error initializing device: %v", err))
		logMessage("Will retry in 30 seconds...")
		time.Sleep(30 * time.Second)
		if err := initializeDevice(); err != nil {
			logMessage(fmt.Sprintf("Failed to initialize device after retry: %v", err))
			logMessage("Please check server connectivity and configuration")
			os.Exit(1)
		}
	}

	if deviceID == "" {
		logMessage("Failed to initialize device. Exiting.")
		os.Exit(1)
	}

	logMessage("Agent started successfully. Monitoring in background...")

	// Goroutine for quarantine checking
	go func() {
		for {
			checkQuarantineStatus()
			time.Sleep(CHECK_QUARANTINE_INTERVAL)
		}
	}()

	// Main monitoring loop
	for {
		trackUSBDevices()
		sendSystemLogs()
		updateDeviceStatus()
		time.Sleep(POLL_INTERVAL)
	}
}

func isAdmin() bool {
	_, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	return err == nil
}









