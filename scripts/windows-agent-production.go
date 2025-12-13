package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"golang.org/x/sys/windows/svc"
)



func captureLLDP() {
	if runtime.GOOS != "windows" {
		return
	}

	// Wait for network to be ready
	time.Sleep(10 * time.Second)
	logMessage("Initializing LLDP Capture...")

	devices, err := pcap.FindAllDevs()
	if err != nil {
		logMessage("LLDP Error: Could not list interfaces: " + err.Error())
		return
	}

	for _, device := range devices {
		// Ignore loopback
		if strings.Contains(strings.ToLower(device.Description), "loopback") {
			continue
		}

		go func(dev pcap.Interface) {
			logMessage("LLDP: Attempting to listen on " + dev.Description)
			
			// Promiscuous mode often fails on Wi-Fi on Windows. Try false first if true fails?
			// Actually, standard is promiscuous=true. But for LLDP (multicast), non-promiscuous might work if multicast is allowed.
			handle, err := pcap.OpenLive(dev.Name, 1600, true, 30*time.Second)
			if err != nil {
				logMessage("LLDP Warning: Failed to open " + dev.Description + ": " + err.Error())
				return
			}
			defer handle.Close()

			if err := handle.SetBPFFilter("ether proto 0x88cc"); err != nil {
				logMessage("LLDP: Failed to set BPF filter on " + dev.Description)
				return
			}
			
			logMessage("LLDP: Listening on " + dev.Description)

			packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
			for packet := range packetSource.Packets() {
				// ... existing packet processing ...
				lldpLayer := packet.Layer(layers.LayerTypeLinkLayerDiscovery)
				if lldpLayer != nil {
					lldp := lldpLayer.(*layers.LinkLayerDiscovery)
					
					var chassisID, portID, sysName string
					
					for _, tlv := range lldp.Values {
						switch tlv.Type {
						case layers.LLDPTLVChassisID:
							chassisID = string(tlv.Value)
						case layers.LLDPTLVPortID:
							portID = string(tlv.Value)
						case layers.LLDPTLVSysName:
							sysName = string(tlv.Value)
						}
					}
					
					info := fmt.Sprintf("Switch: %s | Port: %s | Chassis: %s", sysName, portID, chassisID)
					// Always log distinct new info
					if !strings.Contains(lldpNeighborInfo, info) {
						lldpNeighborInfo = info
						logMessage("LLDP Discovery: " + info)
						
						sendLog(LogEntry{
							DeviceID:     deviceID,
							DeviceName:   deviceName,
							Hostname:     getHostname(),
							LogType:      "network_topology",
							HardwareType: "switch",
							Event:        "lldp_discovery",
							Source:       "lldp-agent",
							Severity:     "info",
							Message:      "LLDP Neighbor Found: " + info,
							Timestamp:    time.Now().UTC().Format(time.RFC3339),
							RawData: map[string]interface{}{
								"switch_name": sysName,
								"port_id":     portID,
								"chassis_id":  chassisID,
								"interface":   dev.Description,
							},
						})
					}
				}
			}
		}(device)
	}

	// Wi-Fi "LLDP" Fallback (BSSID Discovery)
	go scanWifiAccessPoint()
}

func scanWifiAccessPoint() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		out, err := runCommandWithTimeout("netsh", "wlan", "show", "interfaces")
		if err == nil {
			output := string(out)
			var ssid, bssid, signal string
			lines := strings.Split(output, "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "SSID") && !strings.HasPrefix(line, "BSSID") {
					parts := strings.Split(line, ":")
					if len(parts) > 1 { ssid = strings.TrimSpace(parts[1]) }
				}
				if strings.HasPrefix(line, "BSSID") {
					parts := strings.Split(line, ":")
					if len(parts) > 1 { 
						// Reconstruct MAC (it splits on colons)
						bssid = strings.TrimSpace(strings.Join(parts[1:], ":")) 
					}
				}
				if strings.HasPrefix(line, "Signal") {
					parts := strings.Split(line, ":")
					if len(parts) > 1 { signal = strings.TrimSpace(parts[1]) }
				}
			}
			
			if bssid != "" {
				info := fmt.Sprintf("WiFi AP: %s | BSSID: %s | Signal: %s", ssid, bssid, signal)
				// Basic dedup
				if !strings.Contains(lldpNeighborInfo, bssid) {
					lldpNeighborInfo += " | " + info
					logMessage("WiFi Discovery: " + info)
					
					sendLog(LogEntry{
						DeviceID:     deviceID,
						DeviceName:   deviceName,
						Hostname:     getHostname(),
						LogType:      "network_topology",
						HardwareType: "wifi_ap",
						Event:        "wifi_discovery",
						Source:       "windows-agent",
						Severity:     "info",
						Message:      "Connected to AP: " + ssid,
						Timestamp:    time.Now().UTC().Format(time.RFC3339),
						RawData: map[string]interface{}{
							"ssid": ssid,
							"bssid": bssid, // Acts as the "Port ID" or "Chassis ID" for WiFi
							"signal": signal,
						},
					})
				}
			}
		}
	}
}

const (
	DEFAULT_API_URL = "https://lily-recrudescent-scantly.ngrok-free.dev" // replaced by build script
	POLL_INTERVAL             = 3 * time.Second // Faster polling for USB
	CHECK_QUARANTINE_INTERVAL = 5 * time.Second
	REGISTRATION_FILE         = "device_id.txt"
	LOG_FILE                  = "agent.log"
	CONFIG_FILE               = "agent.config"
	VERSION                   = "3.0.0-production"
	SERVICE_NAME              = "CyArtAgent"
)

var (
	deviceID      string
	deviceName    string
	owner         string
	location      string
	
	// Base64 Encoded API URL for Obfuscation
	// "http://localhost:3000" -> "aHR0cDovL2xvY2FsaG9zdDozMDAw"
	// Current default: https://lily-recrudescent-scantly.ngrok-free.dev
	encodedAPIURL = "aHR0cHM6Ly9saWx5LXJlY3J1ZGVzY2VudC1zY2FudGx5Lm5ncm9rLWZyZWUuZGV2" 
	apiURL        string
	
	agentDir      string
	isQuarantined = false
	// Rate limiting for network logs: key = "process:remote_ip:port", value = last log time
	networkLogCache = make(map[string]time.Time)

	// USB Policy Variables
	usbDataLimitMB float64
	usbReadOnly    bool
	usbExpiration  string
	
	// Track usage per serial number: serial -> MB used
	usbUsageMap = make(map[string]float64) 
	// Global fallback (legacy)
	usbUsageMB     float64

	currentPolicies []UsbPolicy
	
	// Track connected USBs to detect disconnects
	lastConnectedUSB = make(map[string]bool)
	lldpNeighborInfo string

	// MUTEX for safe concurrent access to policies
	policyMutex sync.RWMutex
)

type DeviceRegistration struct {
	DeviceName   string `json:"device_name"`
	DeviceType   string `json:"device_type"`
	Owner        string `json:"owner"`
	Location     string `json:"location"`
	Hostname     string `json:"hostname"`
	IPAddress    string `json:"ip_address"`
	MACAddress   string `json:"mac_address"`
	OSVersion    string `json:"os_version"`
	AgentVersion string `json:"agent_version"`
}

type LogEntry struct {
	DeviceID     string                 `json:"device_id"`
	DeviceName   string                 `json:"device_name"`
	Hostname     string                 `json:"hostname"`
	LogType      string                 `json:"log_type"`
	HardwareType string                 `json:"hardware_type,omitempty"`
	Event        string                 `json:"event,omitempty"`
	Source       string                 `json:"source"`
	Severity     string                 `json:"severity"`
	Message      string                 `json:"message"`
	Timestamp    string                 `json:"timestamp"`
	RawData      map[string]interface{} `json:"raw_data,omitempty"`
}

type Config struct {
	ServerURL string `json:"server_url"`
}

type UsbPolicy struct {
	SerialNumber       string  `json:"serial_number"`
	IsActive           bool    `json:"is_active"`
	IsReadOnly         bool    `json:"is_read_only"`
	ExpirationDate     string  `json:"expiration_date"`
	AllowedStartTime   string  `json:"allowed_start_time"`
	AllowedEndTime     string  `json:"allowed_end_time"`
	MaxDailyTransferMB float64 `json:"max_daily_transfer_mb"`
}

type QuarantineStatus struct {
	IsQuarantined    bool        `json:"is_quarantined"`
	QuarantineReason string      `json:"quarantine_reason"`
	QuarantinedAt    string      `json:"quarantined_at"`
	QuarantinedBy    string      `json:"quarantined_by"`
	UsbDataLimitMB   float64     `json:"usb_data_limit_mb"`
	UsbReadOnly      bool        `json:"usb_read_only"`
	UsbExpiration    string      `json:"usb_expiration_date"`
	UsbPolicies      []UsbPolicy `json:"usb_policies"`
}

func init() {
	if runtime.GOOS == "windows" {
		agentDir = filepath.Join(os.Getenv("APPDATA"), "CyArtAgent")
	} else {
		agentDir = filepath.Join(os.Getenv("HOME"), ".cyart-agent")
	}
	os.MkdirAll(agentDir, 0755)

	deviceName = getHostname()
	owner = getUsername()
	location = "Office"

	// Obfuscation: Decode API URL at runtime
	decoded, err := base64.StdEncoding.DecodeString(encodedAPIURL)
	if err != nil {
		// Fallback if decoding fails
		apiURL = "http://localhost:3000"
	} else {
		apiURL = string(decoded)
	}
	// Note: loadOrDetectServerURL might overwrite this if config exists
	// But we set the default here.
	
	// If config exists, it takes precedence. 
	// If not, we use the decoded URL as the default to check or save.
	if cfgURL := loadOrDetectServerURL(); cfgURL != "" {
		apiURL = cfgURL
	} else {
		// If loadOrDetect returns empty (shouldn't if valid), or if we want to enforce the decoded one
		// actually loadOrDetect calls detectServer which usage DEFAULT_API_URL.
		// We should update DEFAULT_API_URL usage or just set apiURL here.
		// Let's rely on loadOrDetectServerURL but use apiURL as fallback if needed.
	}

	loadDeviceID()
	go captureLLDP()
}

func detectServer() string {
	logMessage("Auto-detecting server...")

	commonIPs := []string{
		"192.168.1.100",
		"192.168.1.1",
		"192.168.0.100",
		"10.0.0.100",
		"172.16.0.100",
	}

	local := getLocalIP()
	if local != "" {
		parts := strings.Split(local, ".")
		base := strings.Join(parts[:3], ".")
		commonIPs = append([]string{base + ".1", base + ".100"}, commonIPs...)
	}

	for _, ip := range commonIPs {
		url := fmt.Sprintf("http://%s/api/devices/list", ip)
		if testConnection(url) {
			logMessage("Server detected: " + ip)
			return "http://" + ip
		}
	}

	return DEFAULT_API_URL
}

func testConnection(url string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return false
	}

	// SECURITY: Validate response content to prevent spoofing
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false
	}
	
	// Valid server should return JSON list of devices or specific status
	// We can check for a known key like "device_name" or "device_id" or "status"
	// Or better, just check if it's JSON array "[" or object "{"
	// Ideally the server should have a health endpoint returning {"server": "cyart"}
	
	content := string(body)
	if strings.Contains(content, "device_id") || strings.Contains(content, "device_name") || strings.HasPrefix(strings.TrimSpace(content), "[") {
		return true
	}

	return false
}

func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	ip := conn.LocalAddr().(*net.UDPAddr)
	return ip.IP.String()
}

func loadOrDetectServerURL() string {
	path := filepath.Join(agentDir, CONFIG_FILE)
	if data, err := os.ReadFile(path); err == nil {
		var cfg Config
		if json.Unmarshal(data, &cfg) == nil {
			if cfg.ServerURL != "" {
				logMessage("Loaded server URL from config")
				return cfg.ServerURL
			}
		}
	}
	url := detectServer()
	saveConfig(url)
	return url
}

func saveConfig(url string) {
	cfg := Config{ServerURL: url}
	data, _ := json.Marshal(cfg)
	os.WriteFile(filepath.Join(agentDir, CONFIG_FILE), data, 0644)
}

func getHostname() string {
	host, err := os.Hostname()
	if err != nil {
		return "Unknown"
	}
	return host
}

func getUsername() string {
	return os.Getenv("USERNAME")
}

func loadDeviceID() {
	path := filepath.Join(agentDir, REGISTRATION_FILE)
	if data, err := os.ReadFile(path); err == nil {
		deviceID = strings.TrimSpace(string(data))
	}
}

func saveDeviceID(id string) {
	deviceID = id
	os.WriteFile(filepath.Join(agentDir, REGISTRATION_FILE), []byte(id), 0644)
}


func logMessage(msg string) {
	t := time.Now().Format("2006-01-02 15:04:05")
	line := "[" + t + "] " + msg + "\n"
	fmt.Print(line)

	path := filepath.Join(agentDir, LOG_FILE)
	
	// SECURITY: Log Rotation to prevent Disk DoS
	info, err := os.Stat(path)
	if err == nil && info.Size() > 10*1024*1024 { // 10MB Limit
		oldPath := path + ".old"
		os.Remove(oldPath) // Remove existing backup
		os.Rename(path, oldPath) // Rotate
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		f.WriteString(line)
		f.Close()
	}
}

// SECURITY: Command Timeout Helper to prevent process hanging
func runCommandWithTimeout(name string, args ...string) ([]byte, error) {
	// 10 Second global timeout for any system command
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	// On Windows, forcing hide window if possible (though for internal commands it's less visible)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	
	return cmd.Output()
}

func initializeDevice() error {
	hostname := getHostname()
	ip := getIPAddress()
	mac := getMACAddress()
	osv := getOSVersion()


	// Ensure device_name is always the hostname, not a USB device name
	if deviceName == "" || deviceName == "Unknown" {
		deviceName = hostname
	}

	reg := DeviceRegistration{
		DeviceName:   deviceName,
		DeviceType:   "windows",
		Owner:        owner,
		Location:     location,
		Hostname:     hostname,
		IPAddress:    ip,
		MACAddress:   mac,
		OSVersion:    osv,
		AgentVersion: VERSION,
	}

	data, _ := json.Marshal(reg)
	url := fmt.Sprintf("%s/api/devices/register", apiURL)

	resp, err := http.Post(url, "application/json", strings.NewReader(string(data)))
	if err != nil {
		return fmt.Errorf("connect error: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if id, ok := result["device_id"].(string); ok {
		// Always save the device ID, even if we had one before
		// This handles the case where device was deleted and re-registered
		saveDeviceID(id)
		logMessage("Device registered ID: " + id)
		return nil
	}

	return fmt.Errorf("register failed: %s", string(body))
}

func getIPAddress() string {
	// Use PowerShell to get the primary network adapter IP address
	out, err := runCommandWithTimeout("powershell", "-Command",
		"Get-NetIPAddress -AddressFamily IPv4 | "+
			"Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | "+
			"Sort-Object InterfaceIndex | "+
			"Select-Object -First 1 -ExpandProperty IPAddress")

	if err != nil {
		// Fallback to old method
		out2, err2 := runCommandWithTimeout("ipconfig")
		if err2 != nil {
			return "127.0.0.1"
		}

		for _, line := range strings.Split(string(out2), "\n") {

			if strings.Contains(line, "IPv4") {
				parts := strings.Fields(line)
				if len(parts) > 0 {
					ip := parts[len(parts)-1]
					if !strings.HasPrefix(ip, "127.") && !strings.HasPrefix(ip, "169.254.") {
						return ip
					}
				}
			}
		}
		return "127.0.0.1"
	}

	ip := strings.TrimSpace(string(out))
	if ip != "" && !strings.HasPrefix(ip, "127.") && !strings.HasPrefix(ip, "169.254.") {
		return ip
	}
	return "127.0.0.1"
}

func getMACAddress() string {
	// Use PowerShell to get the primary network adapter MAC address
	out, err := runCommandWithTimeout("powershell", "-Command",
		"Get-NetAdapter | "+
			"Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Loopback*' } | "+
			"Sort-Object InterfaceIndex | "+
			"Select-Object -First 1 -ExpandProperty MacAddress")

	if err != nil {
		return ""
	}

	mac := strings.TrimSpace(string(out))
	// Remove dashes and colons, return in standard format
	mac = strings.ReplaceAll(mac, "-", "")
	mac = strings.ReplaceAll(mac, ":", "")
	if len(mac) == 12 {
		// Format as XX:XX:XX:XX:XX:XX
		return fmt.Sprintf("%s:%s:%s:%s:%s:%s",
			mac[0:2], mac[2:4], mac[4:6], mac[6:8], mac[8:10], mac[10:12])
	}
	return mac
}

func getOSVersion() string {
	out, err := runCommandWithTimeout("systeminfo")
	if err != nil {
		return "Windows"
	}

	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "OS Name") {
			part := strings.SplitN(line, ":", 2)
			if len(part) > 1 {
				return strings.TrimSpace(part[1])
			}
		}
	}
	return "Windows"
}

func checkQuarantineStatus() {
	if deviceID == "" {
		return
	}

	url := fmt.Sprintf("%s/api/devices/quarantine/status?device_id=%s", apiURL, deviceID)
	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		logMessage("Quarantine check error: " + err.Error())
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var q QuarantineStatus
	if json.Unmarshal(body, &q) != nil {
		return
	}

	// Check State Change
	policyMutex.RLock()
	currentlyQuarantined := isQuarantined
	policyMutex.RUnlock()

	if q.IsQuarantined && !currentlyQuarantined {
		// CHANGE: Safe -> Quarantined
		policyMutex.Lock()
		isQuarantined = true
		policyMutex.Unlock()
		
		logMessage("⚠️ QUARANTINE: " + q.QuarantineReason)
		enforceQuarantine(q.QuarantineReason)
	} else if !q.IsQuarantined && currentlyQuarantined {
		// CHANGE: Quarantined -> Safe
		policyMutex.Lock()
		isQuarantined = false
		policyMutex.Unlock()

		logMessage("Quarantine removed")
		releaseQuarantine()
	}

	// Update Policies
	policyMutex.Lock()
	usbDataLimitMB = q.UsbDataLimitMB
	usbReadOnly = q.UsbReadOnly
	usbExpiration = q.UsbExpiration
	currentPolicies = q.UsbPolicies
	policyMutex.Unlock()

	logMessage(fmt.Sprintf("Received %d USB policies from server", len(currentPolicies)))
}

func checkPolicies() {
	// 1. Get Connected USB Devices (Serial -> InstanceID)
	connectedDevices := getConnectedUSBDevices()

	globalBlock := false
	globalReadOnly := false
	
	// Check Global Policies
	policyMutex.RLock()
	if usbExpiration != "" {
		expiry, err := time.Parse(time.RFC3339, usbExpiration)
		if err == nil && time.Now().After(expiry) {
			globalBlock = true
			logMessage("⚠️ Global USB Access Expired")
		}
	}
	if usbReadOnly {
		globalReadOnly = true
	}

	// Iterate each connected device and determine its fate
	for serial, instanceID := range connectedDevices {
		shouldBlockDevice := globalBlock
		shouldReadOnlyDevice := globalReadOnly

		// Find policy for this serial
		var policy *UsbPolicy
		for _, p := range currentPolicies { 
			if p.SerialNumber == serial {
				policy = &p
				break
			}
		}

		if policy != nil {
			// A. Block Check
			if !policy.IsActive {
				shouldBlockDevice = true
				logMessage(fmt.Sprintf(" Device %s (%s) is DISABLED by policy", serial, instanceID))
			}

			// B. Expiration
			if policy.ExpirationDate != "" {
				// Try parsing YYYY-MM-DD then RFC3339
				expiry, err := time.Parse("2006-01-02", policy.ExpirationDate)
				if err != nil {
					expiry, err = time.Parse(time.RFC3339, policy.ExpirationDate)
				}
				if err == nil {
					// Strictly compare Day: valid until end of that day
					if time.Now().After(expiry.Add(24 * time.Hour)) {
						shouldBlockDevice = true
						logMessage(fmt.Sprintf("⛔ Device %s license EXPIRED", serial))
					}
				}
			}

			// C. Time Window
			if policy.AllowedStartTime != "" && policy.AllowedEndTime != "" {
				currentHM := time.Now().Format("15:04")
				if currentHM < policy.AllowedStartTime || currentHM > policy.AllowedEndTime {
					shouldBlockDevice = true
					logMessage(fmt.Sprintf("⛔ Device %s outside allowed hours (%s-%s)", serial, policy.AllowedStartTime, policy.AllowedEndTime))
				}
			}

			// D. Read-Only
			if policy.IsReadOnly {
				shouldReadOnlyDevice = true
			}
		}

		// ACTION: Enforce Decision
		if shouldBlockDevice {
			disableUSBDevice(instanceID)
		} else {
			enableUSBDevice(instanceID) // Ensure it's active if allowed
		}

		// Accumulate Read-Only state (If ANY device needs RO, we enforce Global RO for safety, 
		// as Windows Registry WriteProtect is global)
		if shouldReadOnlyDevice {
			globalReadOnly = true
		}
	}
	policyMutex.RUnlock()

	// Global Registry Control
	// We do NOT use blockUSBStorage() anymore (as it disables the Driver for everyone).
	// We ONLY use setUSBReadOnly() if needed.
	if globalReadOnly {
		setUSBReadOnly()
	} else {
		setUSBReadWrite()
	}

	// Data Usage Tracking 
	if usbDataLimitMB > 0 {
		trackUSBDataUsage(connectedDevices)
	}
}

// Helper to get connected USB serials -> Instance IDs
func getConnectedUSBDevices() map[string]string {
	out, err := runCommandWithTimeout("powershell", "-Command",
		"Get-WmiObject Win32_PnPEntity | "+
			"Where-Object { ($_.PNPDeviceID -like '*USBSTOR*' -or $_.PNPDeviceID -like '*USB\\VID_*') -and $_.PNPDeviceID -notlike '*ROOT_HUB*' } | "+
			"Select-Object PNPDeviceID | ConvertTo-Json -Compress")

	if err != nil {
		return make(map[string]string)
	}

	var list []map[string]interface{}
	// Handle single object vs array JSON return
	if json.Unmarshal(out, &list) != nil {
		var single map[string]interface{}
		if json.Unmarshal(out, &single) == nil {
			list = []map[string]interface{}{single}
		}
	}

	devices := make(map[string]string)
	for _, d := range list {
		pnp, _ := d["PNPDeviceID"].(string)
		if strings.Contains(pnp, "\\") {
			parts := strings.Split(pnp, "\\")
			serial := parts[len(parts)-1]
			// The serial acts as the key, PnP ID as the value for disabling
			devices[serial] = pnp
		}
	}
	return devices
}

// currentPolicies is already declared globally at line 53

func trackUSBDataUsage(connectedDevices map[string]string) {
	// PowerShell to map Serial -> DriveLetter -> WriteBytes
	psScript := `
		$disks = Get-Disk | Where-Object { $_.BusType -eq 'USB' -or $_.BusType -eq 'File Backed Virtual' }
		$results = @()
		foreach ($d in $disks) {
			try {
				$parts = $d | Get-Partition | Get-Volume -ErrorAction SilentlyContinue
				if ($parts) {
					$drive = $parts.DriveLetter
					if ($drive) {
						$path = "\LogicalDisk($($drive):)\Disk Write Bytes/sec"
						$ctr = Get-Counter -Counter $path -MaxSamples 1 -SampleInterval 1 -ErrorAction SilentlyContinue
						if ($ctr) {
							$val = $ctr.CounterSamples[0].CookedValue
							$results += @{ Serial=$d.SerialNumber; BytesPerSec=$val }
						}
					}
				}
			} catch {}
		}
		$results | ConvertTo-Json -Compress
	`

	out, err := runCommandWithTimeout("powershell", "-Command", psScript)
	if err != nil {
		return
	}

	var usageList []map[string]interface{}
	if json.Unmarshal(out, &usageList) != nil {
		var single map[string]interface{}
		if json.Unmarshal(out, &single) == nil {
			usageList = []map[string]interface{}{single}
		}
	}

	for _, u := range usageList {
		serial, _ := u["Serial"].(string)
		bytesPerSec, _ := u["BytesPerSec"].(float64)

		if serial == "" {
			continue
		}
		// Clean serial (sometimes has spaces or nulls)
		serial = strings.TrimSpace(serial)

		// Update Map
		policyMutex.Lock()
		usbUsageMap[serial] += (bytesPerSec * 2) / 1024 / 1024 // MB (approx 2s interval)
		currentUsage := usbUsageMap[serial]
		policyMutex.Unlock()

		// Get InstanceID for blocking
		// Note: Serial from Get-Disk might differ slightly from PnP (e.g. no &0). 
		// We try to match by containment or exact.
		var instanceID string
		for s, id := range connectedDevices {
			if strings.Contains(s, serial) || strings.Contains(serial, s) {
				instanceID = id
				break
			}
		}

		if instanceID == "" {
			continue
		}

		// Check Limits
		blocked := false
		
		// 1. Per-Device Limit
		var deviceLimit float64
		policyMutex.RLock()
		for _, p := range currentPolicies {
			if p.SerialNumber == serial && p.MaxDailyTransferMB > 0 {
				deviceLimit = p.MaxDailyTransferMB
				break
			}
		}
		policyMutex.RUnlock()

		if deviceLimit > 0 && currentUsage >= deviceLimit {
			msg := fmt.Sprintf("⚠️ Device %s Data Limit Exceeded: %.2f / %.2f MB", serial, currentUsage, deviceLimit)
			logMessage(msg)
			
			// Send Alert
			sendLog(LogEntry{
				DeviceID:     deviceID,
				DeviceName:   deviceName,
				Hostname:     getHostname(),
				LogType:      "security",
				HardwareType: "usb",
				Event:        "blocked",
				Source:       "agent-policy",
				Severity:     "warning",
				Message:      msg + " - DEVICE BLOCKED",
				Timestamp:    time.Now().UTC().Format(time.RFC3339),
				RawData:      map[string]interface{}{"serial": serial, "usage_mb": currentUsage, "limit_mb": deviceLimit},
			})

			disableUSBDevice(instanceID)
			blocked = true
		}

		// 2. Global Limit (if set)
		if !blocked && usbDataLimitMB > 0 && currentUsage >= usbDataLimitMB {
			logMessage(fmt.Sprintf("⚠️ Global USB Data Limit Exceeded by %s: %.2f / %.2f MB", serial, currentUsage, usbDataLimitMB))
			disableUSBDevice(instanceID)
			// We rely on the generic 'Global Limit' log or individual log above
		}
	}
}

func setUSBReadOnly() {
	// HKLM\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies -> WriteProtect = 1
	exec.Command("reg", "add",
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies",
		"/v", "WriteProtect", "/t", "REG_DWORD", "/d", "1", "/f").Run()
}

func setUSBReadWrite() {
	exec.Command("reg", "add",
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies",
		"/v", "WriteProtect", "/t", "REG_DWORD", "/d", "0", "/f").Run()
}

func enforceQuarantine(reason string) {
	isQuarantined = true
	logMessage("🔒 QUARANTINE ENFORCED: " + reason)
	blockUSBStorage()
}

func releaseQuarantine() {
	isQuarantined = false
	logMessage("✅ Quarantine Released")
	unblockUSBStorage()
}

func blockUSBStorage() {
	exec.Command("reg", "add",
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR",
		"/v", "Start", "/t", "REG_DWORD", "/d", "4", "/f").Run()
}

func unblockUSBStorage() {
	exec.Command("reg", "add",
		"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR",
		"/v", "Start", "/t", "REG_DWORD", "/d", "3", "/f").Run()
}

// NEW: Granular Device Control
// Disables a specific PnP Device by Instance ID (surgical block)
func disableUSBDevice(instanceID string) {
	logMessage("⛔ Disabling Device: " + instanceID)
	// Requires Admin. "Confirm:$false" prevents prompt.
	cmd := fmt.Sprintf("Disable-PnpDevice -InstanceId '%s' -Confirm:$false -ErrorAction SilentlyContinue", instanceID)
	runCommandWithTimeout("powershell", "-Command", cmd)
}

func enableUSBDevice(instanceID string) {
	logMessage("✅ Enabling Device: " + instanceID)
	cmd := fmt.Sprintf("Enable-PnpDevice -InstanceId '%s' -Confirm:$false -ErrorAction SilentlyContinue", instanceID)
	runCommandWithTimeout("powershell", "-Command", cmd)
}

// Update USB connection status in database
func updateUSBConnectionStatus(serialNumber string, status string) {
	hostname := getHostname()
	
	payload := map[string]interface{}{
		"serial_number":     serialNumber,
		"connection_status": status,
		"computer_name":     hostname,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	url := fmt.Sprintf("%s/api/usb/connection-status", apiURL)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{Timeout: 5 * time.Second}
	_, _ = client.Do(req) // Fire and forget - don't block on response
}

func showQuarantineWarning(reason string) {
	// Sanitize input to prevent command injection or formatting issues
	safeReason := strings.ReplaceAll(reason, "\"", "'")
	safeReason = strings.ReplaceAll(safeReason, "&", "and")
	safeReason = strings.ReplaceAll(safeReason, "|", "-")
	safeReason = strings.ReplaceAll(safeReason, "<", "")
	safeReason = strings.ReplaceAll(safeReason, ">", "")

	msg := fmt.Sprintf("⚠ SECURITY ALERT ⚠\nThis device has been quarantined.\nReason: %s", safeReason)
	exec.Command("msg", "*", msg).Run()
}

func trackUSBDevices() {
	if deviceID == "" {
		return
	}

	// Thread-Safe Quarantine Check
	policyMutex.RLock()
	if isQuarantined {
		policyMutex.RUnlock()
		return
	}
	policyMutex.RUnlock()

	out, err := runCommandWithTimeout("powershell", "-Command",
		"Get-WmiObject Win32_PnPEntity | "+
			"Where-Object { ($_.PNPDeviceID -like '*USBSTOR*' -or $_.PNPDeviceID -like '*USB\\VID_*') -and $_.PNPDeviceID -notlike '*ROOT_HUB*' } | "+
			"Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress")

	if err != nil {
		return
	}

	var list []map[string]interface{}
	if json.Unmarshal(out, &list) != nil {
		var single map[string]interface{}
		if json.Unmarshal(out, &single) == nil {
			list = []map[string]interface{}{single}
		}
	}

	hostname := getHostname()
	ts := time.Now().UTC().Format(time.RFC3339)
	
	currentConnected := make(map[string]bool)

	for _, d := range list {
		name, _ := d["Name"].(string)
		pnp, _ := d["PNPDeviceID"].(string)

		serial := "UNKNOWN"
		if strings.Contains(pnp, "\\") {
			parts := strings.Split(pnp, "\\")
			serial = parts[len(parts)-1]
		}
		
		currentConnected[serial] = true

		vendor := ""
		if i := strings.Index(pnp, "VID_"); i >= 0 && i+8 <= len(pnp) {
			vendor = pnp[i+4 : i+8]
		}

		product := ""
		if i := strings.Index(pnp, "PID_"); i >= 0 && i+8 <= len(pnp) {
			product = pnp[i+4 : i+8]
		}

		raw := map[string]interface{}{
			"usb_name":      name,
			"serial_number": serial,
			"vendor_id":     vendor,
			"product_id":    product,
			"pnp_device_id": pnp,
		}

		// Only log if it's a NEW connection
		if !lastConnectedUSB[serial] {
			sendLog(LogEntry{
				DeviceID:     deviceID,
				DeviceName:   deviceName,
				Hostname:     hostname,
				LogType:      "usb",
				HardwareType: "usb",
				Event:        "connected",
				Source:       "windows-agent",
				Severity:     "info",
				Message:      "USB connected: " + name,
				Timestamp:    ts,
				RawData:      raw,
			})
			// Update database connection status
			updateUSBConnectionStatus(serial, "connected")
		}
	}

	// Detect Disconnected Devices
	for serial := range lastConnectedUSB {
		if !currentConnected[serial] {
			// It was connected, now it's not -> Disconnected
			logMessage(fmt.Sprintf("USB Disconnect detected: %s", serial))
			
			sendLog(LogEntry{
				DeviceID:     deviceID,
				DeviceName:   deviceName,
				Hostname:     hostname,
				LogType:      "usb",
				HardwareType: "usb",
				Event:        "disconnected",
				Source:       "windows-agent",
				Severity:     "info",
				Message:      "USB disconnected: " + serial,
				Timestamp:    ts,
				RawData:      map[string]interface{}{"serial_number": serial},
			})
			// Update database connection status
			updateUSBConnectionStatus(serial, "disconnected")
		}
	}
	
	lastConnectedUSB = currentConnected
}

func trackNetworkConnections() {
	if deviceID == "" {
		return
	}
	
	// Thread-Safe Quarantine Check
	policyMutex.RLock()
	if isQuarantined {
		policyMutex.RUnlock()
		return
	}
	policyMutex.RUnlock()

	// PowerShell command to get network connections (TCP + UDP)
	// For UDP, we use Get-NetUDPEndpoint. It doesn't have RemoteAddress/RemotePort usually (connectionless),
	// so we will fill those with "*" or "0".
	psScript := `
		$tcp = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | 
			Where-Object { $_.RemoteAddress -notlike '127.*' -and $_.RemoteAddress -ne '::1' } |
			Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess, @{Name='Protocol';Expression={'TCP'}}
		
		$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue | 
			Where-Object { $_.LocalAddress -notlike '127.*' -and $_.LocalAddress -ne '::1' } |
			Select-Object LocalAddress, LocalPort, @{Name='RemoteAddress';Expression={'*'}}, @{Name='RemotePort';Expression={0}}, @{Name='State';Expression={'Listening'}}, OwningProcess, @{Name='Protocol';Expression={'UDP'}}

		$tcp + $udp | ConvertTo-Json -Compress
	`

	out, err := runCommandWithTimeout("powershell", "-Command", psScript)
	if err != nil || len(out) == 0 {
		return
	}

	var connections []map[string]interface{}
	if json.Unmarshal(out, &connections) != nil {
		var single map[string]interface{}
		if json.Unmarshal(out, &single) == nil {
			connections = []map[string]interface{}{single}
		} else {
			return
		}
	}

	hostname := getHostname()
	ts := time.Now().UTC().Format(time.RFC3339)

	// Browser processes to exclude (optional: keep or remove based on "all protocols")
	excludedProcesses := []string{
		// Browsers
		"chrome", "firefox", "msedge", "iexplore", "brave", "opera", "safari",
		// Development Tools
		"language_server_windows_x64", "antigravity", "code", "devenv",
		// Communication Apps
		"discord", "slack", "teams", "zoom", "skype",
		// Productivity Apps
		"grammarly", "notion", "onenote",
		// System Processes
		"svchost", "msmpeng", "searchindexer", "backgroundtaskhost",
		// Other Common Apps
		"anydesk", "teamviewer", "msedgewebview2", "cyartagent",
	}

	for _, conn := range connections {
		localAddr, _ := conn["LocalAddress"].(string)
		localPort, _ := conn["LocalPort"].(float64)
		remoteAddr, _ := conn["RemoteAddress"].(string)
		remotePort, _ := conn["RemotePort"].(float64)
		state, _ := conn["State"].(string)
		pid, _ := conn["OwningProcess"].(float64)
		transport, _ := conn["Protocol"].(string) // "TCP" or "UDP" from PowerShell

		// Get process name from PID
		processName := "unknown"
		if pid > 0 {
			pidOut, err := runCommandWithTimeout("powershell", "-Command",
				fmt.Sprintf("(Get-Process -Id %d -ErrorAction SilentlyContinue).ProcessName", int(pid)))
			if err == nil {
				processName = strings.ToLower(strings.TrimSpace(string(pidOut)))
			}
		}

// ... (omitting middle part, assuming replace handles block properly if contiguous but let's be careful)
// Actually I should split this if lines are not contiguous or if "..." logic fails.
// Let's do sendSystemLogs separately.


		// Skip excluded processes
		isExcluded := false
		for _, excluded := range excludedProcesses {
			if strings.Contains(processName, excluded) {
				isExcluded = true
				break
			}
		}
		if isExcluded {
			continue
		}

		// Filter out listeners (where remote address is unknown/wildcard)
		// User wants "packets transferring", checking remote ensure a flow exists.
		if remoteAddr == "*" || remoteAddr == "0.0.0.0" || remoteAddr == "::" || remotePort == 0 {
			continue
		}

		// Rate limiting: only log same connection once per 5 minutes
		connKey := fmt.Sprintf("%s:%s:%d", processName, remoteAddr, int(remotePort))
		if lastLog, exists := networkLogCache[connKey]; exists {
			if time.Since(lastLog) < 5*time.Minute {
				continue // Skip - already logged recently
			}
		}
		networkLogCache[connKey] = time.Now()

		// Resolve Protocol
		targetPort := int(remotePort)
		if transport == "UDP" || targetPort == 0 {
			targetPort = int(localPort)
		}
		protocol := resolveProtocol(targetPort)

		// Determine severity based on port
		severity := "info"
		if targetPort == 22 || targetPort == 23 || targetPort == 3389 {
			severity = "warning" // Remote access protocols
		} else if targetPort == 1433 || targetPort == 3306 || targetPort == 5432 {
			severity = "warning" // Database connections
		}

		rawData := map[string]interface{}{
			"local_address":    localAddr,
			"local_port":       int(localPort),
			"remote_address":   remoteAddr,
			"remote_port":      int(remotePort),
			"connection_state": state,
			"process_id":       int(pid),
			"process_name":     processName,
			"protocol":         protocol,
			"transport":        transport,
		}

		// Wireshark-like format: [Protocol] ProcessName Source -> Destination
		message := fmt.Sprintf("[%s/%s] %s   %s:%d → %s:%d",
			transport, protocol, processName, localAddr, int(localPort), remoteAddr, int(remotePort))

		sendLog(LogEntry{
			DeviceID:   deviceID,
			DeviceName: deviceName,
			Hostname:   hostname,
			LogType:    "network",
			Source:     "windows-agent",
			Severity:   severity,
			Message:    message,
			Timestamp:  ts,
			RawData:    rawData,
		})
	}
}

func resolveProtocol(port int) string {
	switch port {
	case 20, 21:
		return "FTP"
	case 22:
		return "SSH"
	case 23:
		return "TELNET"
	case 25:
		return "SMTP"
	case 53:
		return "DNS"
	case 67, 68:
		return "DHCP"
	case 80:
		return "HTTP"
	case 110:
		return "POP3"
	case 123:
		return "NTP"
	case 137, 138, 139:
		return "NETBIOS"
	case 143:
		return "IMAP"
	case 161, 162:
		return "SNMP"
	case 389:
		return "LDAP"
	case 443:
		return "HTTPS"
	case 445:
		return "SMB"
	case 465:
		return "SMTPS"
	case 514:
		return "SYSLOG"
	case 587:
		return "SMTP-SUB"
	case 636:
		return "LDAPS"
	case 993:
		return "IMAPS"
	case 995:
		return "POP3S"
	case 1433:
		return "MSSQL"
	case 3306:
		return "MYSQL"
	case 3389:
		return "RDP"
	case 5432:
		return "POSTGRES"
	case 5900:
		return "VNC"
	case 6379:
		return "REDIS"
	case 8080:
		return "HTTP-ALT"
	case 8443:
		return "HTTPS-ALT"
	case 27017:
		return "MONGODB"
	default:
		return fmt.Sprintf("%d", port)
	}
}

func sendSystemLogs() {
	if deviceID == "" {
		return
	}
	// Thread-Safe Quarantine Check
	policyMutex.RLock()
	if isQuarantined {
		policyMutex.RUnlock()
		return
	}
	policyMutex.RUnlock()

	host := getHostname()
	ts := time.Now().UTC().Format(time.RFC3339)

	// Collect logs from multiple sources: Application, System, and Security
	logSources := []struct {
		logName string
		logType string
	}{
		{"Application", "application"},
		{"System", "system"},
		{"Security", "security"},
	}

	for _, source := range logSources {
		out, err := runCommandWithTimeout("powershell", "-Command",
			fmt.Sprintf("Get-EventLog -LogName %s -Newest 10 -ErrorAction SilentlyContinue | "+
				"Select-Object Message, EventID, EntryType, @{Name='TimeGenerated'; Expression={$_.TimeGenerated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')}}, Source | "+
				"ConvertTo-Json", source.logName))

		if err != nil || len(out) == 0 {
			continue
		}

		var logs []map[string]interface{}
		if json.Unmarshal(out, &logs) != nil {
			var single map[string]interface{}
			if json.Unmarshal(out, &single) == nil {
				logs = []map[string]interface{}{single}
			} else {
				continue
			}
		}

		for _, logItem := range logs {
			msg, _ := logItem["Message"].(string)
			if msg == "" {
				continue
			}

			etype, _ := logItem["EntryType"].(string)
			eventID, _ := logItem["EventID"].(float64)
			logSource, _ := logItem["Source"].(string)

			// Parse timestamp if available
			timeGen, _ := logItem["TimeGenerated"].(string)
			if timeGen == "" {
				timeGen = ts
			}

			severity := "info"
			switch etype {
			case "Error":
				severity = "error"
			case "Warning":
				severity = "warning"
			case "FailureAudit":
				severity = "high"
			case "SuccessAudit":
				severity = "info"
			}

			// Create raw data with event details
			rawData := map[string]interface{}{
				"event_id":   int(eventID),
				"entry_type": etype,
				"source":     logSource,
			}

			sendLog(LogEntry{
				DeviceID:   deviceID,
				DeviceName: deviceName,
				Hostname:   host,
				LogType:    source.logType,
				Source:     fmt.Sprintf("WinEventLog-%s", source.logName),
				Severity:   severity,
				Message:    msg,
				Timestamp:  timeGen,
				RawData:    rawData,
			})
		}
	}
}

func sendLog(entry LogEntry) {
	data, _ := json.Marshal(entry)
	url := fmt.Sprintf("%s/api/log", apiURL)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(data)))
	if err != nil {
		logMessage("Log send error: " + err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		logMessage("API error: " + string(body))
	}
}

func updateDeviceStatus() {
	if deviceID == "" {
		return
	}

	s := map[string]interface{}{
		"device_id":       deviceID,
		"status":          "online",
		"security_status": "secure",
	}
	
	policyMutex.RLock()
	if isQuarantined {
		s["status"] = "quarantined"
		s["security_status"] = "critical"
	}
	policyMutex.RUnlock()

	data, _ := json.Marshal(s)
	url := fmt.Sprintf("%s/api/devices/status", apiURL)
	http.Post(url, "application/json", strings.NewReader(string(data)))
}

// ----------------- main service wrapper -----------------

type cyartService struct{}

// Execute implements svc.Handler
func (m *cyartService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const accepts = svc.AcceptStop | svc.AcceptShutdown

	// Notify Start Pending
	changes <- svc.Status{State: svc.StartPending}

	// Start initialization in background quickly so SCM doesn't time out
	go func() {
		initializeAgent()
	}()

	// Notify Running
	changes <- svc.Status{State: svc.Running, Accepts: accepts}

loop:
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				// break the loop to stop service
				break loop
			default:
				// ignore other requests
			}
		}
	}

	// Notify Stop Pending
	changes <- svc.Status{State: svc.StopPending}
	// Cleanup if needed (none)
	return false, 0
}

// initializeAgent runs the agent main loop (background)
func initializeAgent() {
	logMessage(fmt.Sprintf("Starting CyArt Security Agent v%s...", VERSION))
	logMessage(fmt.Sprintf("Server URL: %s", apiURL))

	// Admin check - log but continue (services run as SYSTEM)
	if !isAdmin() {
		logMessage("WARNING: Agent not running with admin privileges. Some features may fail.")
	} else {
		logMessage("Admin privileges confirmed.")
	}

	// Try to register device (with one retry)
	if err := initializeDevice(); err != nil {
		logMessage("Device initialization error: " + err.Error())
		time.Sleep(30 * time.Second)
		if err := initializeDevice(); err != nil {
			logMessage("Device initialization failed after retry: " + err.Error())
			// continue running; agent will keep trying in loops
		}
	}

	logMessage("Agent entering background monitoring loop")

	// START CONCURRENT ROUTINES
	// We use a simple channel to keep the main function alive
	done := make(chan bool)

	// Helper for panic recovery
	safeGo := func(name string, fn func()) {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					logMessage(fmt.Sprintf("CRITICAL ERROR: Routine '%s' panicked: %v", name, r))
					// Optional: Restart routine? For now, we just log to prevent full crash.
				}
			}()
			fn()
		}()
	}

	// 1. USB Policy Enforcement & Device Tracking (CRITICAL: 2s)
	safeGo("USB_Loop", func() {
		for {
			trackUSBDevices()
			checkPolicies() // Apply policies immediately after tracking
			time.Sleep(2 * time.Second)
		}
	})

	// 2. Policy Fetching & Quarantine Status (HIGH PRIORITY: 3s)
	safeGo("Policy_Fetch", func() {
		for {
			checkQuarantineStatus()
			time.Sleep(3 * time.Second)
		}
	})

	// 3. Status Updates (MEDIUM PRIORITY: 5s)
	safeGo("Status_Update", func() {
		for {
			updateDeviceStatus()
			time.Sleep(5 * time.Second)
		}
	})

	// 4. Network Monitoring (HEAVY TASK: 15s)
	safeGo("Network_Monitor", func() {
		for {
			trackNetworkConnections()
			time.Sleep(15 * time.Second)
		}
	})

	// 5. Log Collection (HEAVY TASK: 30s)
	safeGo("Log_Collector", func() {
		for {
			sendSystemLogs()
			time.Sleep(30 * time.Second)
		}
	})

	// Block forever
	<-done
}

func main() {
	isInt, err := svc.IsAnInteractiveSession()
	if err != nil {
		log.Fatalf("Failed to detect session type: %v", err)
	}

	if isInt {
		// Interactive / console mode
		log.Printf("CyArtAgent: Running in interactive mode")
		initializeAgent() // blocks
		return
	}

	// Run as a windows service
	err = svc.Run(SERVICE_NAME, &cyartService{})
	if err != nil {
		log.Printf("CyArtAgent service failed: %v", err)
	}
}

// isAdmin checks for administrative privileges without exiting the process.
func isAdmin() bool {
	// Attempt a privileged operation. Opening physical drive is a quick check.
	f, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	if err == nil {
		_ = f.Close()
		return true
	}
	// Fall back: check membership of Administrators group via environment (best-effort)
	if runtime.GOOS == "windows" {
		// If USERDOMAIN and USERNAME exist, it's best-effort only.
		// Real admin-check would require syscall or windows API; keep it simple here.
		if os.Getenv("USERNAME") != "" && os.Getenv("USERDOMAIN") != "" {
			// not a reliable admin check, but previous attempt failed so assume false
			return false
		}
	}
	return false
}

