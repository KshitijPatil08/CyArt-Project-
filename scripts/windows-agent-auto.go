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
	DEFAULT_API_URL = "http://192.168.1.100" // Default server IP - will auto-detect
	POLL_INTERVAL   = 30 * time.Second
	REGISTRATION_FILE = "device_id.txt"
	LOG_FILE       = "agent.log"
	CONFIG_FILE    = "agent.config"
)

var (
	deviceID   string
	deviceName string
	owner      string
	location   string
	apiURL     string
	agentDir   string
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

func init() {
	// Get app data directory
	if runtime.GOOS == "windows" {
		agentDir = filepath.Join(os.Getenv("APPDATA"), "CyArtAgent")
	} else {
		agentDir = filepath.Join(os.Getenv("HOME"), ".cyart-agent")
	}
	
	// Create directory if it doesn't exist
	os.MkdirAll(agentDir, 0755)
	
	// Set defaults
	deviceName = getHostname()
	owner = getUsername()
	location = "Office"
	
	// Load or detect server URL
	apiURL = loadOrDetectServerURL()
	
	// Load device ID if exists
	loadDeviceID()
}

// Auto-detect server on local network
func detectServer() string {
	logMessage("Auto-detecting server on local network...")
	
	// Try common server IPs
	commonIPs := []string{
		"192.168.1.100",
		"192.168.1.1",
		"192.168.0.100",
		"10.0.0.100",
		"172.16.0.100",
	}
	
	// Get local network range
	localIP := getLocalIP()
	if localIP != "" {
		parts := strings.Split(localIP, ".")
		if len(parts) == 4 {
			baseIP := strings.Join(parts[:3], ".")
			commonIPs = append([]string{baseIP + ".100", baseIP + ".1"}, commonIPs...)
		}
	}
	
	// Test each IP
	for _, ip := range commonIPs {
		url := fmt.Sprintf("http://%s/api/devices/list", ip)
		if testConnection(url) {
			logMessage(fmt.Sprintf("Found server at: %s", ip))
			return fmt.Sprintf("http://%s", ip)
		}
	}
	
	// Try to discover via network scan (simplified)
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
	
	// Scan common server IPs in subnet
	for i := 1; i <= 254; i++ {
		if i == 100 || i == 1 || i%10 == 0 { // Check common server IPs
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
	return resp.StatusCode == 200 || resp.StatusCode == 401 // 401 is OK, means server is there
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
	
	// Try to load from config file
	if data, err := os.ReadFile(configPath); err == nil {
		var config Config
		if json.Unmarshal(data, &config) == nil && config.ServerURL != "" {
			logMessage(fmt.Sprintf("Loaded server URL from config: %s", config.ServerURL))
			return config.ServerURL
		}
	}
	
	// Auto-detect server
	serverURL := detectServer()
	
	// Save detected URL to config
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
	
	// Print to console
	fmt.Print(logEntry)
	
	// Write to log file
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
		AgentVersion: "2.0.0",
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

func trackUSBDevices() {
	if deviceID == "" {
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
	if deviceID == "" {
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
	logMessage("Starting CyArt Device Tracking Agent (Auto-Configured)...")
	logMessage(fmt.Sprintf("Server URL: %s", apiURL))

	// Initialize device
	if err := initializeDevice(); err != nil {
		logMessage(fmt.Sprintf("Error initializing device: %v", err))
		logMessage("Will retry in 30 seconds...")
		time.Sleep(30 * time.Second)
		// Retry once
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

	// Main loop
	for {
		trackUSBDevices()
		sendSystemLogs()
		updateDeviceStatus()
		time.Sleep(POLL_INTERVAL)
	}
}


