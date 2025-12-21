package main

import (
	"bytes"
	"bufio"
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
	"github.com/gosnmp/gosnmp"
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
				errTracker.Track("LLDP_Capture_Open", err)
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
	scanFunc := func() {
		out, err := runCommandWithTimeout("netsh", "wlan", "show", "interfaces")
		if err == nil {
			output := string(out)
			var ssid, bssid, signal string
			lines := strings.Split(output, "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				// Check BSSID first (as "BSSID" contains "SSID")
				if strings.Contains(line, "BSSID") {
					parts := strings.Split(line, ":")
					if len(parts) > 1 { 
						// Reconstruct MAC (it splits on colons)
						bssid = strings.TrimSpace(strings.Join(parts[1:], ":")) 
					}
					continue
				}
				
				// Check SSID (ensure it's not the BSSID line)
				if strings.Contains(line, "SSID") {
					parts := strings.Split(line, ":")
					if len(parts) > 1 { ssid = strings.TrimSpace(parts[1]) }
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
			} else {
				logMessage(fmt.Sprintf("WiFi Scan: Parsed SSID='%s' BSSID='%s' Signal='%s'. Skipping as empty or no BSSID.", ssid, bssid, signal))
			}
		} else {
			logMessage("WiFi Scan Error: " + err.Error())
		}
	}

	logMessage("Triggering initial Wi-Fi scan...")
	scanFunc()

	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		scanFunc()
	}
}

// ----------------- Gateway Detection (Router/Firewall) -----------------
func detectGateway() {
	// Parse 'ipconfig' or 'route print' to get Default Gateway
	// Simple approach: Use 'route print 0.0.0.0'
	out, err := runCommandWithTimeout("route", "print", "0.0.0.0")
	if err != nil {
		return
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		// Standard output line: 0.0.0.0  0.0.0.0  192.168.1.1  192.168.1.100  25
		if len(fields) > 4 && fields[0] == "0.0.0.0" && fields[1] == "0.0.0.0" {
			gatewayIP := fields[2]
			
			// Try to resolve MAC via ARP
			gatewayMAC := resolveARP(gatewayIP)
			
			info := fmt.Sprintf("Gateway: %s | MAC: %s", gatewayIP, gatewayMAC)
			if !strings.Contains(lldpNeighborInfo, gatewayIP) {
				lldpNeighborInfo += " | " + info
				logMessage("Gateway Discovery: " + info)

				sendLog(LogEntry{
					DeviceID:     deviceID,
					DeviceName:   deviceName,
					Hostname:     getHostname(),
					LogType:      "network_topology",
					HardwareType: "router", // Default Gateway is usually the Router/FW
					Event:        "gateway_discovery",
					Source:       "windows-agent",
					Severity:     "info",
					Message:      "Connected to Gateway: " + gatewayIP,
					Timestamp:    time.Now().UTC().Format(time.RFC3339),
					RawData: map[string]interface{}{
						"ip": gatewayIP,
						"mac": gatewayMAC,
						"switch_name": "Gateway", // Fallback for topology parser
						"port_id": "Uplink",
					},
				})
			}
		}
	}
}

func resolveARP(ip string) string {
	out, err := runCommandWithTimeout("arp", "-a", ip)
	if err != nil {
		return "Unknown"
	}
	// Output: 192.168.1.1  14-cc-20-xx-xx-xx  dynamic
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if strings.Contains(line, ip) {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return normalizeMAC(fields[1])
			}
		}
	}
	return "Unknown"
}

func normalizeMAC(mac string) string {
	mac = strings.ReplaceAll(mac, "-", ":")
	return strings.ToUpper(mac)
}

// ----------------- SSDP Discovery (UPnP) -----------------
func performSSDPDiscovery() {
	ssdpAddr, err := net.ResolveUDPAddr("udp", "239.255.255.250:1900")
	if err != nil {
		logMessage("SSDP Error: " + err.Error())
		return
	}

	conn, err := net.ListenUDP("udp", nil)
	if err != nil {
		logMessage("SSDP Listen Error: " + err.Error())
		return
	}
	defer conn.Close()

	// M-SEARCH Packet
	msg := "M-SEARCH * HTTP/1.1\r\n" +
		"HOST: 239.255.255.250:1900\r\n" +
		"MAN: \"ssdp:discover\"\r\n" +
		"MX: 1\r\n" +
		"ST: ssdp:all\r\n" +
		"\r\n"

	_, err = conn.WriteTo([]byte(msg), ssdpAddr)
	if err != nil {
		return
	}

	// Listen for responses for 5 seconds
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	buf := make([]byte, 2048)

	discovered := make(map[string]bool)

	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			break 
		}

		resp := string(buf[:n])
		lines := strings.Split(resp, "\r\n")
		
		var server, location, usn, st string
		for _, line := range lines {
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "server:") {
				server = strings.TrimSpace(line[7:])
			} else if strings.HasPrefix(lower, "location:") {
				location = strings.TrimSpace(line[9:])
			} else if strings.HasPrefix(lower, "usn:") {
				usn = strings.TrimSpace(line[4:])
			} else if strings.HasPrefix(lower, "st:") {
				st = strings.TrimSpace(line[3:])
			}
		}

		// Filter for network infrastructure devices (granular)
		lowerServer := strings.ToLower(server)
		lowerST := strings.ToLower(st)
		
		var hwType string
		if strings.Contains(lowerST, "gateway") || strings.Contains(lowerST, "igd") {
			hwType = "router"
		} else if strings.Contains(lowerST, "repeater") || strings.Contains(lowerServer, "extender") {
			hwType = "repeater"
		} else if strings.Contains(lowerServer, "switch") {
			hwType = "switch"
		} else if (strings.Contains(lowerServer, "linux") || strings.Contains(lowerServer, "router")) && hwType == "" {
			hwType = "router" // Fallback
		}

		if hwType != "" {
			id := usn
			if id == "" { id = location }
			
			if id != "" && !discovered[id] {
				discovered[id] = true
				
				info := fmt.Sprintf("UPnP Device: %s | Type: %s | ST: %s", server, hwType, st)
				if !strings.Contains(lldpNeighborInfo, server) { // Dedup with global log
					logMessage("SSDP Discovery: " + info)
					
					// Log to Server
					sendLog(LogEntry{
						DeviceID:     deviceID,
						DeviceName:   deviceName,
						Hostname:     getHostname(),
						LogType:      "network_topology",
						HardwareType: hwType,
						Event:        "ssdp_discovery",
						Source:       "windows-agent",
						Severity:     "info",
						Message:      "Discovered Device: " + server,
						Timestamp:    time.Now().UTC().Format(time.RFC3339),
						RawData: map[string]interface{}{
							"switch_name": server, 
							"port_id": "UPnP",
							"chassis_id": id,
							"details": st,
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
	
	// Base64 Encoded API URL for Obfuscation - DEPRECATED / FALLBACK ONLY
	// "http://localhost:3000" -> "aHR0cDovL2xvY2FsaG9zdDozMDAw"
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
	usbUsageMB     float64
	lastResetDate  string // YYYY-MM-DD
	
	// Track usage per serial number: serial -> MB used
	usbUsageMap = make(map[string]float64)
	
	// File Tracker to prevent overcounting USB data
	// Path -> FileInfo
)

// File Tracker for USB Deduplication - Struct definition moved to top level
// (Already defined at line 486 in previous edits, so we just remove it from here to avoid duplication if it exists,
// or if not, we rely on the one I added at 486.
// Wait, I added it at 486. So I should just REMOVE it from here.)

// Error Tracker definition was also inside var block. I should move it out.
type ErrorTracker struct {
	mu     sync.Mutex
	errors map[string]int
}

var (
	// File Tracker to prevent overcounting USB data
	// Path -> FileInfo (FileInfo is defined below/elsewhere)
	fileTrackerMU sync.Mutex
	// fileTracker is already defined as a global variable elsewhere (line 496 in previous edit).
	// removing duplicate declaration if present or just cleaning up.
	// Actually, line 496 `var fileTracker = ...` interacts with this `var (...)` block.
	// if I have `var (...)` ending at 450, and then I defined `var fileTracker = ...` at 496.
	// checks...

	currentPolicies []UsbPolicy

	// Track connected USBs to detect disconnects
	lastConnectedUSB = make(map[string]bool)
	lldpNeighborInfo string
	
	// Track last read-only state to detect changes
	lastReadOnlyState = false
	
	// Periodic update counter for USB status heartbeat
	periodicUpdateCounter = 0

	// MUTEX for safe concurrent access to policies
	policyMutex sync.RWMutex

	globalApprovedSoftware []string

	// Unverified Software Cache to avoid repeated logging
	softwareAuditCache = make(map[string]bool)

	// Error Tracker Instance
	errTracker = &ErrorTracker{errors: make(map[string]int)}
)

func (et *ErrorTracker) Track(component string, err error) {
	et.mu.Lock()
	defer et.mu.Unlock()

	key := fmt.Sprintf("%s:%s", component, err.Error())
	et.errors[key]++

	// Report to server after 5 consecutive failures
	if et.errors[key] >= 5 {
		sendLog(LogEntry{
			LogType:  "system",
			Severity: "error",
			Message:  fmt.Sprintf("%s failed 5 times: %v", component, err),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Source: "windows-agent",
			DeviceID: deviceID,
			DeviceName: deviceName,
			Hostname: getHostname(),
		})
		et.errors[key] = 0 // Reset
	}
}

func (et *ErrorTracker) GetCount(duration time.Duration) int {
	et.mu.Lock()
	defer et.mu.Unlock()
	count := 0
	for _, v := range et.errors {
		count += v
	}
	return count
}

// File Tracker for USB Deduplication
type FileTracker struct {
	mu    sync.Mutex
	files map[string]FileInfo
}

type FileInfo struct {
	LastSize int64
	LastMod  time.Time
}

var fileTracker = &FileTracker{files: make(map[string]FileInfo)}

func (ft *FileTracker) ProcessEvent(path string, size int64) int64 {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	info, exists := ft.files[path]

	if !exists {
		// New file - count full size
		ft.files[path] = FileInfo{LastSize: size, LastMod: time.Now()}
		return size
	}

	// Existing file - count delta only
	delta := size - info.LastSize
	if delta > 0 {
		ft.files[path] = FileInfo{LastSize: size, LastMod: time.Now()}
		return delta
	}

	// If size decreased or same, update reference but no data usage increase
	if size != info.LastSize {
		ft.files[path] = FileInfo{LastSize: size, LastMod: time.Now()}
	}

	return 0
}

// Cleanup old entries periodically
func (ft *FileTracker) Cleanup() {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	cutoff := time.Now().Add(-1 * time.Hour)
	for path, info := range ft.files {
		if info.LastMod.Before(cutoff) {
			delete(ft.files, path)
		}
	}
}

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
	MaxDailyTransferMB float64  `json:"max_daily_transfer_mb"`
	ApprovedSoftware   []string `json:"approved_software"` // Whitelist for this device
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
	ApprovedSoftware []string    `json:"approved_software"` // Global software whitelist
}

type AgentState struct {
	UsbUsageMB       float64            `json:"usb_usage_mb"`
	LastResetDate    string             `json:"last_reset_date"`
	UsbUsageMap      map[string]float64 `json:"usb_usage_map"`
	ApprovedSoftware []string           `json:"approved_software"`
}

func saveAgentState() {
	policyMutex.RLock()
	state := AgentState{
		UsbUsageMB:    usbUsageMB,
		LastResetDate: lastResetDate,
		UsbUsageMap:   make(map[string]float64),
	}
	// Copy per-device usage map
	for serial, usage := range usbUsageMap {
		state.UsbUsageMap[serial] = usage
	}
	// Extract unique approved software from all policies
	approvedSet := make(map[string]bool)
	for _, p := range currentPolicies {
		for _, s := range p.ApprovedSoftware {
			approvedSet[s] = true
		}
	}
	for s := range approvedSet {
		state.ApprovedSoftware = append(state.ApprovedSoftware, s)
	}
	policyMutex.RUnlock()

	data, _ := json.MarshalIndent(state, "", "  ")
	os.WriteFile(filepath.Join(agentDir, "agent_state.json"), data, 0644)
}

func loadAgentState() {
	path := filepath.Join(agentDir, "agent_state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var state AgentState
	if err := json.Unmarshal(data, &state); err == nil {
		policyMutex.Lock()
		usbUsageMB = state.UsbUsageMB
		lastResetDate = state.LastResetDate
		// Restore per-device usage map
		if state.UsbUsageMap != nil {
			usbUsageMap = state.UsbUsageMap
		} else {
			usbUsageMap = make(map[string]float64)
		}
		// We don't overwrite server-provided policies here, 
		// but we could use state.ApprovedSoftware as a secondary cache if needed.
		policyMutex.Unlock()
		logMessage(fmt.Sprintf("💾 Loaded agent state: %.2f MB used today.", state.UsbUsageMB))
	}
}

func init() {
	if runtime.GOOS == "windows" {
		// Use ProgramData for Service compatibility
		agentDir = filepath.Join("C:\\ProgramData", "CyArtAgent")
	} else {
		agentDir = filepath.Join(os.Getenv("HOME"), ".cyart-agent")
	}
	os.MkdirAll(agentDir, 0755)
	fmt.Println("----------------------------------------------------------------")
	fmt.Printf("CYART AGENT INITIALIZED\n")
	fmt.Printf("Agent Directory: %s\n", agentDir)
	fmt.Println("----------------------------------------------------------------")

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
	// Load Config or Env takes precedence
	if cfgURL := loadOrDetectServerURL(); cfgURL != "" {
		apiURL = cfgURL
	} else if envURL := os.Getenv("CYART_API_URL"); envURL != "" {
		apiURL = envURL
		logMessage("Loaded API URL from Environment: " + apiURL)
	} else {
		// Fallback to decoded default
		logMessage("Using default obfuscated API URL")
	}

	loadDeviceID()
	go captureLLDP()
	
	// Start Gateway Discovery (Once per minute)
	// Start Gateway Discovery (Run immediately then ticker)
	go detectGateway()
	go func() {
		for {
			time.Sleep(60 * time.Second)
			detectGateway()
		}
	}()

	// Start SSDP Discovery (Every 30 seconds)
	go func() {
		for {
			performSSDPDiscovery()
			time.Sleep(30 * time.Second)
		}
	}()
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

	decoded, _ := base64.StdEncoding.DecodeString(encodedAPIURL)
	return string(decoded)
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
				return strings.TrimSpace(cfg.ServerURL)
			}
		}
	}
	url := detectServer()
	saveConfig(url)
	return strings.TrimSpace(url)
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

	// For PowerShell commands, add -WindowStyle Hidden to prevent window popup
	if strings.ToLower(name) == "powershell" || strings.ToLower(name) == "powershell.exe" {
		// Insert -WindowStyle Hidden after powershell but before other args
		newArgs := []string{"-WindowStyle", "Hidden"}
		newArgs = append(newArgs, args...)
		args = newArgs
	}

	cmd := exec.CommandContext(ctx, name, args...)
	// On Windows, forcing hide window if possible (though for internal commands it's less visible)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	
	return cmd.Output()
}

// Helper function to create hidden exec.Command for background execution
func createHiddenCommand(name string, args ...string) *exec.Cmd {
	// For PowerShell commands, add -WindowStyle Hidden to prevent window popup
	if strings.ToLower(name) == "powershell" || strings.ToLower(name) == "powershell.exe" {
		newArgs := []string{"-WindowStyle", "Hidden"}
		newArgs = append(newArgs, args...)
		args = newArgs
	}
	
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
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

// ----------------- Offline Quarantine Safety -----------------
var lastReenableTime time.Time

func checkQuarantineStatus() {
	if deviceID == "" {
		return
	}

	// OFFLINE QUARANTINE LOGIC:
	// If quarantined, the network is likely DISABLED.
	// We need to briefly enable it to check for the "Release" command.
	policyMutex.RLock()
	quarantined := isQuarantined
	policyMutex.RUnlock()

	if quarantined {
		// Check every 2 minutes (TIMELY SCRIPT PREFERENCE)
		if time.Since(lastReenableTime) < 2*time.Minute {
			return // Too soon, stay offline
		}

		logMessage(" Quarantine Heartbeat: Temporarily enabling network to check status...")
		unblockNetwork()
		
		// Wait for DHCP and Connection (Windows can take a few seconds)
		time.Sleep(15 * time.Second)
		lastReenableTime = time.Now()
	}

	url := fmt.Sprintf("%s/api/devices/quarantine/status?device_id=%s", apiURL, deviceID)
	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	
	// Handle Network Error (likely if unblock failed or no internet)
	if err != nil {
		logMessage("Quarantine check error: " + err.Error())
		// If we were quarantined and opened the gate, ensure we close it on error
		if quarantined {
			logMessage(" Check failed. Re-enforcing quarantine.")
			blockNetwork()
		}
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
	} else if q.IsQuarantined && currentlyQuarantined {
		// STILL Quarantined: Re-disable network after our check
		logMessage("🔒 Device still quarantined. Disabling network.")
		blockNetwork()
	}

	// Update Policies
	policyMutex.Lock()
	usbDataLimitMB = q.UsbDataLimitMB
	usbReadOnly = q.UsbReadOnly
	usbExpiration = q.UsbExpiration
	currentPolicies = q.UsbPolicies
	globalApprovedSoftware = q.ApprovedSoftware
	policyMutex.Unlock()

	logMessage(fmt.Sprintf("Received %d USB policies from server", len(currentPolicies)))
}

func checkPolicies() {
	// Thread-Safe State Access
	policyMutex.RLock()
	quarantined := isQuarantined
	policies := currentPolicies
	currentGlobalUsage := usbUsageMB
	gExpiration := usbExpiration
	gDataLimit := usbDataLimitMB
	gReadOnly := usbReadOnly
	
	// Get connected serials safely
	connectedSerials := make([]string, 0, len(lastConnectedUSB))
	for serial, connected := range lastConnectedUSB {
		if connected {
			connectedSerials = append(connectedSerials, serial)
		}
	}
	policyMutex.RUnlock()

	shouldBlock := quarantined
	blockReason := ""
	if quarantined {
		blockReason = "System is in Quarantine"
	}
	shouldReadOnly := false

	// === GLOBAL POLICY CHECKS (Apply to ALL devices) ===
	
	// 1. Global Expiration Check
	if !shouldBlock && gExpiration != "" {
		dateStr := gExpiration
		if idx := strings.Index(dateStr, "T"); idx > 0 {
			dateStr = dateStr[:idx]
		}
		expiry, err := time.Parse("2006-01-02", dateStr)
		if err == nil {
			// Block if current date is AFTER expiration date (at start of expiry day)
			expiryEndOfDay := expiry.Add(24 * time.Hour) // Allow through the entire expiration day
			if time.Now().After(expiryEndOfDay) {
				shouldBlock = true
				blockReason = "Global USB Access Expired on " + dateStr
			}
		}
	}

	// 2. Global Data Limit Check
	if !shouldBlock && gDataLimit > 0 && currentGlobalUsage >= gDataLimit {
		shouldBlock = true
		blockReason = fmt.Sprintf("Global USB Data Limit Reached (%.2f / %.2f MB)", currentGlobalUsage, gDataLimit)
	}

	// 3. Global Read-Only
	if gReadOnly {
		shouldReadOnly = true
	}

	// === PER-DEVICE POLICY CHECKS ===
	for _, serial := range connectedSerials {
		if shouldBlock {
			break // Already blocking, no need to check further
		}

		// Find policy for this serial
		var policy *UsbPolicy
		for i := range policies {
			if policies[i].SerialNumber == serial {
				policy = &policies[i]
				break
			}
		}

		// If no specific policy, continue (device inherits global policies only)
		if policy == nil {
			continue
		}

		// Check 1: Active Status
		if !policy.IsActive {
			shouldBlock = true
			blockReason = fmt.Sprintf("Device %s is Disabled by Policy", serial)
			break
		}

		// Check 2: Per-Device Expiration
		if policy.ExpirationDate != "" {
			dateStr := policy.ExpirationDate
			if idx := strings.Index(dateStr, "T"); idx > 0 {
				dateStr = dateStr[:idx]
			}
			expiry, err := time.Parse("2006-01-02", dateStr)
			if err == nil {
				expiryEndOfDay := expiry.Add(24 * time.Hour)
				if time.Now().After(expiryEndOfDay) {
					shouldBlock = true
					blockReason = fmt.Sprintf("Device %s Access Expired on %s", serial, dateStr)
					break
				}
			}
		}

		// Check 3: Per-Device Data Limit
		// Use per-serial usage tracking
		if policy.MaxDailyTransferMB > 0 {
			policyMutex.RLock()
			deviceUsage := usbUsageMap[serial]
			policyMutex.RUnlock()
			
			if deviceUsage >= policy.MaxDailyTransferMB {
				shouldBlock = true
				blockReason = fmt.Sprintf("Device %s Data Limit Reached (%.2f / %.2f MB)", 
					serial, deviceUsage, policy.MaxDailyTransferMB)
				break
			}
		}

		// Check 4: Time Window
		if policy.AllowedStartTime != "" && policy.AllowedEndTime != "" {
			if !isInTimeWindow(policy.AllowedStartTime, policy.AllowedEndTime) {
				shouldBlock = true
				blockReason = fmt.Sprintf("Device %s access denied outside allowed hours (%s-%s)", 
					serial, policy.AllowedStartTime, policy.AllowedEndTime)
				break
			}
		}

		// Check 5: Per-Device Read-Only
		if policy.IsReadOnly {
			shouldReadOnly = true
		}
	}

	// === ENFORCEMENT ===
	if shouldBlock {
		logMessage("⛔ BLOCKING USB: " + blockReason)
		blockUSBStorage()
		
		// Force dismount any currently mounted USB drives
		forceDismountUSB()
		
		showQuarantineWarning(blockReason)
		
		// Send Security Log
		sendLog(LogEntry{
			DeviceID:   deviceID,
			DeviceName: deviceName,
			Hostname:   getHostname(),
			LogType:    "security",
			Source:     "agent-policy",
			Severity:   "critical",
			Message:    "USB Access Blocked: " + blockReason,
			Timestamp:  time.Now().UTC().Format(time.RFC3339),
		})

	} else if shouldReadOnly {
		// Enforce Read-Only
		policyMutex.RLock()
		wasRO := lastReadOnlyState
		policyMutex.RUnlock()

		if !wasRO {
			logMessage("🔒 Enforcing Read-Only Policy")
			setUSBReadOnly()
			policyMutex.Lock()
			lastReadOnlyState = true
			policyMutex.Unlock()
			
			showPolicyChangeNotification("USB Read-Only Mode", "Write protection enabled by policy.")
		}
		// Ensure Storage is UNBLOCKED (Readable)
		unblockUSBStorage()

	} else {
		// Allow Read/Write
		policyMutex.RLock()
		wasRO := lastReadOnlyState
		policyMutex.RUnlock()

		if wasRO {
			logMessage("🔓 Restoring Read-Write Access")
			setUSBReadWrite()
			policyMutex.Lock()
			lastReadOnlyState = false
			policyMutex.Unlock()
			
			showPolicyChangeNotification("USB Access Restored", "Full read-write access enabled.")
		}
		// Ensure Storage is UNBLOCKED
		unblockUSBStorage()
	}
}

// Add this new function to force dismount USB drives:
func forceDismountUSB() {
	logMessage("Forcing dismount of USB drives...")
	
	// PowerShell script to dismount all removable drives
	psScript := "Get-Volume | Where-Object { $_.DriveType -eq 'Removable' } | ForEach-Object { " +
		"$driveLetter = $_.DriveLetter; " +
		"if ($driveLetter) { " +
		"Write-Host \"Dismounting $driveLetter\"; " +
		"$volume = Get-Volume -DriveLetter $driveLetter; " +
		"$volume | Get-Partition | Remove-PartitionAccessPath -AccessPath \"${driveLetter}:\" -ErrorAction SilentlyContinue " +
		"} " +
		"}"
	
	out, err := runCommandWithTimeout("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	if err != nil {
		logMessage("Warning: Force dismount failed: " + err.Error())
	} else {
		logMessage("USB drives dismounted: " + string(out))
	}
}

func isInTimeWindow(start, end string) bool {
	currentHM := time.Now().Format("15:04") // HH:MM 24h format
	// Handle cross-midnight? Simplest case: Start < End
	if start <= end {
		return currentHM >= start && currentHM <= end
	}
	// Cross-midnight: Start > End (e.g. 22:00 to 06:00)
	return currentHM >= start || currentHM <= end
}


var usbMonitorCmd *exec.Cmd

func trackUSBDataUsage() {
	// Daily Reset Logic
	today := time.Now().Format("2006-01-02")
	policyMutex.Lock()
	if lastResetDate != today {
		logMessage(fmt.Sprintf("📅 New Day: Resetting USB usage (was %.2f MB global).", usbUsageMB))
		usbUsageMB = 0
		usbUsageMap = make(map[string]float64) // Reset per-device tracking
		lastResetDate = today
	}
	policyMutex.Unlock()

	// Get list of connected USB serials
	policyMutex.RLock()
	connectedSerials := make([]string, 0)
	for serial, connected := range lastConnectedUSB {
		if connected {
			connectedSerials = append(connectedSerials, serial)
		}
	}
	policyMutex.RUnlock()

	// If no USB devices connected, skip monitoring
	if len(connectedSerials) == 0 {
		return
	}

	// Monitor ONLY Removable Drives (DriveType=2)
	// Get current write rate for USB drives
	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command",
		"$drives = Get-CimInstance Win32_LogicalDisk | Where-Object DriveType -eq 2; "+
			"if ($drives) { "+
			"$counters = $drives | ForEach-Object { \"\\\\LogicalDisk(\" + $_.DeviceID + \")\\\\Disk Write Bytes/sec\" }; "+
			"$sample = Get-Counter -Counter $counters -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue; "+
			"if ($sample) { "+
			"$sample.CounterSamples | ForEach-Object { "+
			"[PSCustomObject]@{ Path = $_.Path; Value = $_.CookedValue } "+
			"} | ConvertTo-Json -Compress "+
			"} else { \"[]\" } "+
			"} else { \"[]\" }")

	out, err := cmd.Output()
	if err != nil {
		return
	}

	// Parse results
	var samples []map[string]interface{}
	json.Unmarshal(out, &samples)

	totalBytesPerSec := 0.0
	for _, sample := range samples {
		if val, ok := sample["Value"].(float64); ok {
			totalBytesPerSec += val
		}
	}

	// Convert to MB (polling interval is 2 seconds)
	incrementMB := (totalBytesPerSec * 2) / 1024 / 1024

	// Update global and per-device usage
	policyMutex.Lock()
	usbUsageMB += incrementMB
	
	// Distribute usage across connected devices (simple approach)
	// In a perfect world, we'd track which serial number wrote what
	// For now, we split equally or assign to first connected device
	if len(connectedSerials) > 0 {
		perDeviceIncrement := incrementMB / float64(len(connectedSerials))
		for _, serial := range connectedSerials {
			usbUsageMap[serial] += perDeviceIncrement
		}
	}
	
	currentUsage := usbUsageMB
	currentLimit := usbDataLimitMB
	policyMutex.Unlock()

	// Log if significant usage detected
	if incrementMB > 0.1 { // More than 100KB written
		logMessage(fmt.Sprintf("📊 USB Write Activity: %.2f MB/s (Total today: %.2f MB)", 
			totalBytesPerSec/1024/1024, currentUsage))
	}

	// Check against GLOBAL limit
	if currentLimit > 0 && currentUsage >= currentLimit {
		logMessage(fmt.Sprintf("⚠️ CRITICAL: Global USB Data Limit Reached: %.2f / %.2f MB", 
			currentUsage, currentLimit))

		sendLog(LogEntry{
			DeviceID:   deviceID,
			DeviceName: deviceName,
			Hostname:   getHostname(),
			LogType:    "security",
			Source:     "agent-policy",
			Severity:   "critical",
			Message:    fmt.Sprintf("Global USB Data Limit Exceeded (%.2f/%.2f MB) - Triggering Block", currentUsage, currentLimit),
			Timestamp:  time.Now().UTC().Format(time.RFC3339),
		})

		// Trigger immediate block via checkPolicies
		// The next checkPolicies() call (within 2s) will enforce the block
		saveAgentState()
	}

	// Check per-device limits
	policyMutex.RLock()
	policies := currentPolicies
	policyMutex.RUnlock()

	for _, serial := range connectedSerials {
		for _, policy := range policies {
			if policy.SerialNumber == serial && policy.MaxDailyTransferMB > 0 {
				policyMutex.RLock()
				deviceUsage := usbUsageMap[serial]
				policyMutex.RUnlock()

				if deviceUsage >= policy.MaxDailyTransferMB {
					logMessage(fmt.Sprintf("⚠️ Device %s reached data limit: %.2f / %.2f MB", 
						serial, deviceUsage, policy.MaxDailyTransferMB))
					
					sendLog(LogEntry{
						DeviceID:   deviceID,
						DeviceName: deviceName,
						Hostname:   getHostname(),
						LogType:    "security",
						Source:     "agent-policy",
						Severity:   "high",
						Message:    fmt.Sprintf("Device %s Data Limit Exceeded", serial),
						Timestamp:  time.Now().UTC().Format(time.RFC3339),
						RawData: map[string]interface{}{
							"serial_number": serial,
							"usage_mb": deviceUsage,
							"limit_mb": policy.MaxDailyTransferMB,
						},
					})
				}
				break
			}
		}
	}

	saveAgentState()
}

func startUSBFileMonitor() {
	// PowerShell checks for Removable drives (DriveType=2) ONLY. 
	// Removed DriveType=3 check to avoid scanning System C: or internal D: drives.
	psScript := `
		$watchers = @{}
		
		function Update-Watchers {
			# Find Removable Drives (USB Sticks) i.e. DriveType = 2
			$drives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
			foreach ($d in $drives) {
				$root = $d.DeviceID + "\"
				if (-not $watchers.ContainsKey($root)) {
					try {
						$w = New-Object System.IO.FileSystemWatcher
						$w.Path = $root
						$w.IncludeSubdirectories = $true
						$w.EnableRaisingEvents = $true
						
						$action = {
							$path = $Event.SourceEventArgs.FullPath
							$change = $Event.SourceEventArgs.ChangeType
							$size = 0
							try { $size = (Get-Item $path).Length } catch {}
							
							$json = @{ action = "$change"; name = $path; size = $size } | ConvertTo-Json -Compress
							Write-Host "EVENT:$json"
						}
						
						Register-ObjectEvent $w "Created" -Action $action | Out-Null
						Register-ObjectEvent $w "Changed" -Action $action | Out-Null
						$watchers[$root] = $w
						Write-Host "WATCHING:$root"
					} catch {}
				}
			}
		}
		
		while ($true) {
			Update-Watchers
			Start-Sleep -Seconds 5
		}
	`
	
	cmd := createHiddenCommand("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	usbMonitorCmd = cmd
	
	stdout, _ := cmd.StdoutPipe()
	cmd.Start()
	
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "EVENT:") {
			jsonStr := strings.TrimPrefix(line, "EVENT:")
			var event map[string]interface{}
			if json.Unmarshal([]byte(jsonStr), &event) == nil {
				name, _ := event["name"].(string)
				size, _ := event["size"].(float64) // Bytes
				
				// 1. Proactive Blocking: Check if this file PUSHES us over the limit
				sizeMB := size / 1024 / 1024
				policyMutex.RLock()
				projectedUsage := usbUsageMB + sizeMB
				limit := usbDataLimitMB
				policyMutex.RUnlock()

				if limit > 0 && projectedUsage > limit {
					reason := fmt.Sprintf("Proactive Block: Transfer of '%s' (%.2f MB) would exceed %.2f MB limit.", filepath.Base(name), sizeMB, limit)
					logMessage("⛔ " + reason)
					enforceQuarantine(reason)
					showQuarantineWarning(reason)
					return // End routine
				}

				// Log File Transfer
				logMessage(fmt.Sprintf("📂 File Activity: %s (%.2f MB)", name, sizeMB))
				
				// Update Usage (REMOVED - Now handled by polling in trackUSBDataUsage to avoid overcounting)
				policyMutex.RLock()
				currentUsage := usbUsageMB
				currentLimit := usbDataLimitMB
				policyMutex.RUnlock()
				
				// Cleanup old tracking data periodically
				fileTracker.Cleanup()
				
				if currentLimit > 0 && currentUsage > currentLimit { // Only enforce if limit is set (>0)
					logMessage(fmt.Sprintf("⚠️ Data Limit Exceeded: %.2f / %.2f MB", currentUsage, currentLimit))
					enforceQuarantine("USB Data Limit Exceeded")
				}
				
				// Send Log
				sendLog(LogEntry{
					DeviceID:   deviceID,
					DeviceName: deviceName,
					Hostname:   getHostname(),
					LogType:    "usb", // Show in USB Events count
					Source:     "agent-file-monitor",
					Severity:   "info",
					Message:    fmt.Sprintf("File Transfer: %s (%.2f MB)", name, size/1024/1024),
					Timestamp:  time.Now().UTC().Format(time.RFC3339),
				})
			}
		}
	}
	cmd.Wait()
}



func setUSBReadOnly() {
	// Use PowerShell to ensure the key exists and set the value
	// HKLM\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies -> WriteProtect = 1
	psCmd := `
		$path = "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies"
		if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
		Set-ItemProperty -Path $path -Name "WriteProtect" -Value 1 -Type DWord -Force
		
		# FORCE REFRESH: Cycle USB Mass Storage Devices to apply the registry change
		Get-PnpDevice -Class DiskDrive | Where-Object { $_.InstanceId -like "*USB*" -and $_.Status -eq "OK" } | ForEach-Object {
			Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false
			Start-Sleep -Seconds 1
			Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false
		}
	`
	out, err := runCommandWithTimeout("powershell", "-Command", psCmd)
	if err != nil {
		logMessage("❌ CRITICAL ERROR: Failed to enable USB Read-Only! Check Admin Privileges. Error: " + err.Error() + " | Output: " + string(out))
	} else {
		logMessage("🔒 System Registry Updated: USB Write Protection Enabled (WriteProtect=1)")
	}
}

func setUSBReadWrite() {
	// HKLM\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies -> WriteProtect = 0
	psCmd := `
		$path = "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies"
		if (Test-Path $path) {
			Set-ItemProperty -Path $path -Name "WriteProtect" -Value 0 -Type DWord -Force
		}
	`
	out, err := runCommandWithTimeout("powershell", "-Command", psCmd)
	if err != nil {
		logMessage("❌ CRITICAL ERROR: Failed to disable USB Read-Only! Error: " + err.Error() + " | Output: " + string(out))
	} else {
		logMessage("✅ System Registry Updated: USB Write Protection Disabled (WriteProtect=0)")
	}
}

func enforceQuarantine(reason string) {
	isQuarantined = true
	logMessage("🔒 QUARANTINE ENFORCED: " + reason)
	
	// Send log BEFORE cutting network
	sendLog(LogEntry{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Hostname:   getHostname(),
		LogType:    "security",
		Source:     "agent-quarantine",
		Severity:   "critical",
		Message:    "Device Quarantined: " + reason,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	})
	
	blockUSBStorage()
	blockNetwork()
}

func releaseQuarantine() {
	isQuarantined = false
	logMessage("✅ System Quarantine Released (Network Restored)")
	unblockNetwork()
	// NOTE: unblockUSBStorage is NOT called here. checkPolicies() will handle it.
	
	// Send log AFTER restoring network
	// Give it a moment for network to come up (unblockNetwork has no sleep, but runCommand waits)
	// We might want a small sleep here to ensure connectivity before sending
	time.Sleep(5 * time.Second) 
	
	sendLog(LogEntry{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Hostname:   getHostname(),
		LogType:    "security",
		Source:     "agent-quarantine",
		Severity:   "info",
		Message:    "Device Released from Quarantine",
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	})
}

func blockUSBStorage() {
	// 1. Disable USBSTOR and UAS Services
	createHiddenCommand("reg", "add", "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR", "/v", "Start", "/t", "REG_DWORD", "/d", "4", "/f").Run()
	createHiddenCommand("reg", "add", "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\UAS", "/v", "Start", "/t", "REG_DWORD", "/d", "4", "/f").Run()

	// 2. DISCONNECT: Force Disable currently connected USB Storage Devices via Service/Property
	psCmd := `Get-PnpDevice | Where-Object { $_.Service -eq "USBSTOR" -or $_.Service -eq "UASP" } | Where-Object { $_.Status -eq "OK" } | Disable-PnpDevice -Confirm:$false`
	exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psCmd).Run()
}

func unblockUSBStorage() {
	// 1. Re-enable USBSTOR and UAS Services
	createHiddenCommand("reg", "add", "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR", "/v", "Start", "/t", "REG_DWORD", "/d", "3", "/f").Run()
	createHiddenCommand("reg", "add", "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\UAS", "/v", "Start", "/t", "REG_DWORD", "/d", "3", "/f").Run()

	// 2. RECONNECT: Enable devices
	psCmd := `Get-PnpDevice | Where-Object { $_.Service -eq "USBSTOR" -or $_.Service -eq "UASP" } | Where-Object { $_.Status -ne "OK" } | Enable-PnpDevice -Confirm:$false`
	exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psCmd).Run()
}

func blockNetwork() {
	logMessage("🔒 Disabling Network Adapters (Drivers)...")
	
	// FAIL-SAFE: Create a Scheduled Task to re-enable network after 5 minutes
	// This prevents permanent lockout if the agent crashes or server is unreachable.
	createReenableTask()
	
	// PowerShell: Get all physical network adapters and disable them
	// Excluding Loopback and likely virtual adapters if possible, but "Physical" content is key
	psScript := `
		Get-NetAdapter | Where-Object { 
			$_.Status -eq 'Up' -and 
			$_.InterfaceDescription -notlike '*Loopback*' 
		} | Disable-NetAdapter -Confirm:$false
	`
	runCommandWithTimeout("powershell", "-Command", psScript)
	
	logMessage("🔒 Network Drivers Disabled. Device is offline. (Fail-safe restore scheduled for +5 mins)")
}

func createReenableTask() {
	// Schedule task to re-enable network after 5 minutes (safety net)
	// XML definition for a one-time task
	taskXML := `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>%s</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Actions Context="Author">
    <Exec>
      <Command>powershell</Command>
      <Arguments>Get-NetAdapter | Enable-NetAdapter -Confirm:$false</Arguments>
    </Exec>
  </Actions>
</Task>`
	
	// Calculate time 5 minutes from now
	futureTime := time.Now().Add(5 * time.Minute).Format("2006-01-02T15:04:05")
	
	// Create temp XML file
	tmpFile := filepath.Join(os.TempDir(), "enable_net.xml")
	os.WriteFile(tmpFile, []byte(fmt.Sprintf(taskXML, futureTime)), 0644)
	
	// Register Task
	createHiddenCommand("schtasks", "/Create", "/TN", "CyArtNetworkRestore", 
		"/XML", tmpFile, "/F").Run()
	
	os.Remove(tmpFile)
}

func unblockNetwork() {
	logMessage("🔓 Re-enabling Network Adapters...")
	
	// PowerShell: Enable all network adapters
	psScript := "Get-NetAdapter | Where-Object { $_.Status -eq 'Disabled' } | Enable-NetAdapter -Confirm:$false"
	runCommandWithTimeout("powershell", "-Command", psScript)

	logMessage("✅ Network Drivers Enabled. Connectivity restoring...")
}



// Update USB connection status in database
func updateUSBConnectionStatus(serialNumber string, status string) {
	hostname := getHostname()
	
	payload := map[string]interface{}{
		"device_id":         deviceID,
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
	resp, err := client.Do(req)
	if err != nil {
		logMessage("Error updating connection status: " + err.Error())
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		// Truncate body if too long
		msg := string(body)
		if len(msg) > 100 {
			msg = msg[:100] + "..."
		}
		logMessage(fmt.Sprintf("Status update failed (Status %d): %s", resp.StatusCode, msg))
	}
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

func showPolicyChangeNotification(title string, message string) {
	// Sanitize inputs
	safeTitle := strings.ReplaceAll(title, "\"", "'")
	safeMessage := strings.ReplaceAll(message, "\"", "'")
	safeMessage = strings.ReplaceAll(safeMessage, "&", "and")
	safeMessage = strings.ReplaceAll(safeMessage, "|", "-")
	
	msg := fmt.Sprintf("🔔 %s\n\n%s", safeTitle, safeMessage)
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
	
	// Periodic Update Counter
	// We want to force an update every ~30 seconds (15 cycles * 2s) to ensure DB is in sync
	periodicUpdateCounter++
	shouldForceUpdate := periodicUpdateCounter >= 15
	if shouldForceUpdate {
		periodicUpdateCounter = 0
	}
	
	currentConnected := make(map[string]bool)

	for _, d := range list {
		name, _ := d["Name"].(string)
		pnp, _ := d["PNPDeviceID"].(string)

		serial := "UNKNOWN"
			// CLEANING: Robust extraction logic
			// Standard PnP Format: USB\VID_XXXX&PID_YYYY\SERIAL_NUMBER
			// Sometimes: USBSTOR\DISK&VEN_...&PROD_...\SERIAL_NUMBER
			
			// 1. Take the last component (Instance ID)
			parts := strings.Split(pnp, "\\")
			serial = parts[len(parts)-1]

			// 2. Remove common garbage prefixes if they somehow remain (e.g. from raw paths)
			if strings.HasPrefix(serial, "_??_") {
				serial = strings.TrimPrefix(serial, "_??_")
			}

			// 3. Handle cases where the serial itself contains hardware path info (rare but possible in some views)
			// If it looks like "USBSTOR#DISK&...", it's not a cleaned serial.
			if strings.Contains(serial, "#") {
				subParts := strings.Split(serial, "#")
				// Usually the last part of a path-like string is the true unique ID
				serial = subParts[len(subParts)-1]
			}

			// 4. Strip suffix generated by Windows for non-unique serials (contains '&')
			// E.g. "00000000&0" -> "00000000"
			// Real serials usually don't have & unless it's a generated ID.
			if idx := strings.LastIndex(serial, "&"); idx > 0 {
				serial = serial[:idx]
			}
			
			// 5. Final Sanity Check
			if len(serial) < 4 {
				// Too short to be valid, fallback or keep as is?
				// Keep as is, but log warning if debugging
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

		// Update on NEW connection OR Periodic Heartbeat
		if !lastConnectedUSB[serial] || shouldForceUpdate {
			if !lastConnectedUSB[serial] {
				// Only log strictly new events
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
			}
			
			// Update DB status (High reliability)
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

func auditDownloads() {
	userProfile := os.Getenv("USERPROFILE")
	if userProfile == "" {
		return
	}
	downloadsPath := filepath.Join(userProfile, "Downloads")
	
	files, err := os.ReadDir(downloadsPath)
	if err != nil {
		return
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}
		
		name := file.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".exe" && ext != ".msi" && ext != ".dll" {
			continue
		}

		// Skip if already audited
		if softwareAuditCache[name] {
			continue
		}

		fullPath := filepath.Join(downloadsPath, name)
		
		// PowerShell to check Authenticode Signature
		psScript := fmt.Sprintf(`
			$sig = Get-AuthenticodeSignature -FilePath "%s"
			$signer = $sig.SignerCertificate.Subject
			$publisher = $sig.SignerCertificate.Issuer
			if (-not $publisher) { $publisher = "Unknown" }
			$status = $sig.Status
			$year = "Unknown"
			if ($sig.TimeStamperCertificate) {
				$year = $sig.TimeStamperCertificate.NotBefore.Year
			} elseif ($sig.SignerCertificate) {
				$year = $sig.SignerCertificate.NotBefore.Year
			}
			@{Signer=$signer; Publisher=$publisher; Status=$status; Year=$year} | ConvertTo-Json -Compress
		`, fullPath)

		out, err := runCommandWithTimeout("powershell", "-Command", psScript)
		if err == nil {
			var result map[string]interface{}
			json.Unmarshal(out, &result)
			
			status, _ := result["Status"].(string)
			yearVal, _ := result["Year"].(interface{}) 
			publisher, _ := result["Publisher"].(string)
			signer, _ := result["Signer"].(string)

			year := 0
			switch v := yearVal.(type) {
			case float64: year = int(v)
			case string: fmt.Sscanf(v, "%d", &year)
			}

			isOld := year > 0 && year < (time.Now().Year()-5)
			isUnverified := status != "Valid" || isOld || status == "Unknown"
			
			// Log audit result
			if isUnverified {
				reason := "Unverified Signature"
				if isOld { reason = fmt.Sprintf("Outdated Software (Year: %d)", year) }
				
				logMsg := fmt.Sprintf("⚠️ AUDIT ALERT: %s | File: %s | Publisher: %s", reason, name, publisher)
				logMessage(logMsg)

				// Windows Event Log Reporting
				eventCmd := fmt.Sprintf("eventcreate /ID 1001 /L APPLICATION /T WARNING /SO CyArtAgent /D \"%s\"", strings.ReplaceAll(logMsg, "\"", ""))
				createHiddenCommand("powershell", "-Command", eventCmd).Run()

				// PROACTIVE BLOCK: Rename file to prevent execution
				blockedPath := fullPath + ".blocked"
				os.Rename(fullPath, blockedPath)
				logMessage("🚫 INSTALL BLOCKED: Renamed to " + filepath.Base(blockedPath))

				showQuarantineWarning(fmt.Sprintf("Installation Blocked: %s\nPublisher: %s\nYear: %v", name, publisher, yearVal))
				
				sendLog(LogEntry{
					DeviceID:   deviceID,
					DeviceName: deviceName,
					Hostname:   getHostname(),
					LogType:    "application",
					Event:      "software_blocked",
					Source:     "agent-audit",
					Severity:   "warning",
					Message:    fmt.Sprintf("Blocked Installation: %s (Reason: %s)", name, reason),
					Timestamp:  time.Now().UTC().Format(time.RFC3339),
					RawData: map[string]interface{}{
						"filename":  name,
						"status":    status,
						"year":      yearVal,
						"publisher": publisher,
						"signer":    signer,
						"action":    "renamed_to_blocked",
					},
				})

				// SUBMIT APPROVAL REQUEST TO DASHBOARD
				go func() {
					reqBody := map[string]interface{}{
						"name":          name,
						"publisher":     publisher,
						"year":          fmt.Sprintf("%v", yearVal),
						"device_id":     deviceID,
						"computer_name": getHostname(),
					}
					jsonBody, _ := json.Marshal(reqBody)
					http.Post(fmt.Sprintf("%s/api/software/request", apiURL), "application/json", bytes.NewBuffer(jsonBody))
				}()
			} else {
				// Valid software
				logMessage(fmt.Sprintf("✅ Verified Software: %s (Publisher: %s, Year: %d)", name, publisher, year))
			}
			
			// Mark as audited
			softwareAuditCache[name] = true
			saveAgentState()
		}
	}
}

// Remediation: Check if blocked files are now approved
func remediateBlockedSoftware(approvedGlobal []string) {
	userProfile := os.Getenv("USERPROFILE")
	downloadsPath := filepath.Join(userProfile, "Downloads")
	files, err := os.ReadDir(downloadsPath)
	if err != nil {
		return
	}

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".blocked") {
			continue
		}

		originalName := strings.TrimSuffix(file.Name(), ".blocked")
		isApproved := false
		
		// 1. Check Global Approval
		for _, app := range approvedGlobal {
			if app == originalName {
				isApproved = true
				break
			}
		}
		
		// 2. Check Admin Override Checkbox/String
		if strings.Contains(strings.ToLower(originalName), "_approved") {
			isApproved = true
		}

		if isApproved {
			fullPath := filepath.Join(downloadsPath, file.Name())
			restoredPath := filepath.Join(downloadsPath, originalName)
			if err := os.Rename(fullPath, restoredPath); err == nil {
				logMessage("🔓 SOFTWARE APPROVED: Restored " + originalName)
				showPolicyChangeNotification("Software Approved", fmt.Sprintf("%s has been whitelisted and restored.", originalName))
			}
		}
	}
}


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
	loadAgentState()

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
			
			// Get Approved List for Remediation
			policyMutex.RLock()
			approvedList := globalApprovedSoftware
			policyMutex.RUnlock()

			remediateBlockedSoftware(approvedList)
			auditDownloads() // Check for unverified software
			time.Sleep(30 * time.Second)
		}
	})

	// 6. USB Data Usage (High Frequency: 2s)
	safeGo("USB_Usage", func() {
		for {
			trackUSBDataUsage()
			time.Sleep(5 * time.Second)
		}
	})

	// 7. Network Topology Discovery (Background - Fast Updates)
	safeGo("Network_Discovery", func() {
		logMessage("Triggering initial network topology scan...")
		scanNetworkTopology() // Run immediately
		for {
			time.Sleep(2 * time.Second) // Fast discovery for real-time topology
			scanNetworkTopology()
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
// ----------------- SNMP & Topology Discovery -----------------

type SNMPConfig struct {
	CommunityStrings []string
}

func loadSNMPConfig() SNMPConfig {
	// 1. Try Environment Variable (Comma separated)
	env := os.Getenv("CYART_SNMP_COMMUNITY")
	if env != "" {
		return SNMPConfig{CommunityStrings: strings.Split(env, ",")}
	}
	
	// 2. Fallback to defaults (using standard ones, but preferring env var)
	// Ensuring we don't hardcode sensitive custom strings if possible
	return SNMPConfig{
		CommunityStrings: []string{"public"},
	}
}

func scanNetworkTopology() {
	// 1. Get Local Subnet
	ip := getIPAddress()
	if ip == "127.0.0.1" {
		return
	}
	
	// Simple subnet calculation (assuming /24)
	parts := strings.Split(ip, ".")
	if len(parts) < 3 {
		return
	}
	subnet := fmt.Sprintf("%s.%s.%s", parts[0], parts[1], parts[2])
	
	logMessage("Starting Topology Scan on subnet: " + subnet + ".0/24")

	// 2. Scan likely Gateway/Switch IPs (Standard: .1, .254, .2, etc)
	gatewayIP := ""
	out, err := runCommandWithTimeout("route", "print", "0.0.0.0")
	if err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) > 4 && fields[0] == "0.0.0.0" && fields[1] == "0.0.0.0" {
				gatewayIP = fields[2]
				break
			}
		}
	}

	// 3. Batched Concurrent Scanning
	scanSubnetConcurrent(subnet, gatewayIP)
}

func scanSubnetConcurrent(baseIP string, gatewayIP string) {
	const MAX_CONCURRENT = 50
	
	var wg sync.WaitGroup
	sem := make(chan struct{}, MAX_CONCURRENT) // Semaphore
	
	// Scan 1..254
	for i := 1; i < 255; i++ {
		targetIP := fmt.Sprintf("%s.%d", baseIP, i)
		
		// Skip self (optional, but good practice)
		// if targetIP == myIP { continue }

		wg.Add(1)
		go func(ip string) {
			defer wg.Done()
			
			sem <- struct{}{}        // Acquire
			defer func() { <-sem }() // Release
			
			processSNMPTarget(ip)
		}(targetIP)
	}

	wg.Wait()
}

func processSNMPTarget(ip string) {
	config := loadSNMPConfig()
	
	for _, community := range config.CommunityStrings {
		if trySnmpConnection(ip, community) {
			// If successful, we stop trying other communities for THIS ip
			break 
		}
	}
}

func trySnmpConnection(ip string, community string) bool {
	params := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      161,
		Community: community,
		Version:   gosnmp.Version2c,
		Timeout:   time.Duration(2) * time.Second,
		Retries:   0, // Fail fast per community
	}

	err := params.Connect()
	if err != nil {
		return false
	}
	defer params.Conn.Close()

	// OIDs
	oidSysDescr := ".1.3.6.1.2.1.1.1.0"
	oidSysName  := ".1.3.6.1.2.1.1.5.0"
	
	// Get System Info
	result, err := params.Get([]string{oidSysDescr, oidSysName})
	if err != nil {
		return false
	}

	var sysDescr, sysName string
	for _, variable := range result.Variables {
		switch variable.Name {
		case oidSysDescr:
			switch variable.Type {
			case gosnmp.OctetString:
				sysDescr = string(variable.Value.([]byte))
			default:
				sysDescr = fmt.Sprintf("%v", variable.Value)
			}
		case oidSysName:
			switch variable.Type {
			case gosnmp.OctetString:
				sysName = string(variable.Value.([]byte))
			default:
				sysName = fmt.Sprintf("%v", variable.Value)
			}
		}
	}

	if sysName == "" {
		sysName = ip
	}

	// Identify Type
	hwType := "switch" // Default assumption for SNMP devices
	lowerDescr := strings.ToLower(sysDescr)
	
	if strings.Contains(lowerDescr, "router") || strings.Contains(lowerDescr, "gateway") {
		hwType = "router"
	} else if strings.Contains(lowerDescr, "linux") || strings.Contains(lowerDescr, "windows") {
		hwType = "server"
	}
	if strings.Contains(lowerDescr, "printer") {
		hwType = "printer"
	}
	if strings.Contains(lowerDescr, "access point") || strings.Contains(lowerDescr, "ap") {
		hwType = "wifi_ap"
	}

	logMessage(fmt.Sprintf("SNMP Found Device: %s (%s) [%s]", sysName, ip, hwType))

	// Report to Server
	sendLog(LogEntry{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Hostname:   getHostname(),
		LogType:    "network_topology",
		HardwareType: hwType,
		Event:      "snmp_discovery",
		Source:     "agent-snmp",
		Severity:   "info",
		Message:    fmt.Sprintf("SNMP Device Discovered: %s (%s)", sysName, ip),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		RawData: map[string]interface{}{
			"ip": ip,
			"switch_name": sysName,
			"vendor": sysDescr,
			"description": sysDescr,
			"discovery_method": "snmp",
			"community": community, // Debug info
		},
	})
	
	return true
}







