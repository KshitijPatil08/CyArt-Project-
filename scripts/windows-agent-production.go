package main

import (
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
	"time"

	"golang.org/x/sys/windows/svc"
)

const (
	DEFAULT_API_URL           = "https://lily-recrudescent-scantly.ngrok-free.dev" // replaced by build script
	POLL_INTERVAL             = 30 * time.Second
	CHECK_QUARANTINE_INTERVAL = 10 * time.Second
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
	apiURL        string
	agentDir      string
	isQuarantined = false
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

type QuarantineStatus struct {
	IsQuarantined    bool   `json:"is_quarantined"`
	QuarantineReason string `json:"quarantine_reason"`
	QuarantinedAt    string `json:"quarantined_at"`
	QuarantinedBy    string `json:"quarantined_by"`
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

	apiURL = loadOrDetectServerURL()
	loadDeviceID()
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
	resp.Body.Close()
	return resp.StatusCode == 200 || resp.StatusCode == 401
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
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		f.WriteString(line)
		f.Close()
	}
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
	cmd := exec.Command("powershell", "-Command",
		"Get-NetIPAddress -AddressFamily IPv4 | "+
			"Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | "+
			"Sort-Object InterfaceIndex | "+
			"Select-Object -First 1 -ExpandProperty IPAddress")

	out, err := cmd.Output()
	if err != nil {
		// Fallback to old method
		cmd2 := exec.Command("ipconfig")
		out2, err2 := cmd2.Output()
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
	cmd := exec.Command("powershell", "-Command",
		"Get-NetAdapter | "+
			"Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Loopback*' } | "+
			"Sort-Object InterfaceIndex | "+
			"Select-Object -First 1 -ExpandProperty MacAddress")

	out, err := cmd.Output()
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
	cmd := exec.Command("systeminfo")
	out, err := cmd.Output()
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

	if q.IsQuarantined && !isQuarantined {
		isQuarantined = true
		logMessage("⚠️ QUARANTINE: " + q.QuarantineReason)
		enforceQuarantine(q.QuarantineReason)
	} else if !q.IsQuarantined && isQuarantined {
		isQuarantined = false
		logMessage("Quarantine removed")
		releaseQuarantine()
	}
}

func enforceQuarantine(reason string) {
	logMessage("Enforcing quarantine...")

	exec.Command("powershell", "-Command",
		"Get-NetAdapter | Where-Object {$_.InterfaceDescription -notlike '*Loopback*'} | Disable-NetAdapter -Confirm:$false").Run()

	blockUSBStorage()
	showQuarantineWarning(reason)

	logMessage("Quarantine enforced")
}

func releaseQuarantine() {
	logMessage("Releasing quarantine...")

	exec.Command("powershell", "-Command",
		"Get-NetAdapter | Enable-NetAdapter -Confirm:$false").Run()

	unblockUSBStorage()
	logMessage("Quarantine released")
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

func showQuarantineWarning(reason string) {
	msg := fmt.Sprintf("⚠ SECURITY ALERT ⚠\nThis device has been quarantined.\nReason: %s", reason)
	exec.Command("msg", "*", msg).Run()
}

func trackUSBDevices() {
	if deviceID == "" || isQuarantined {
		return
	}

	cmd := exec.Command("powershell", "-Command",
		"Get-WmiObject Win32_PnPEntity | "+
			"Where-Object { ($_.PNPDeviceID -like '*USBSTOR*' -or $_.PNPDeviceID -like '*USB\\VID_*') -and $_.PNPDeviceID -notlike '*ROOT_HUB*' } | "+
			"Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress")

	out, err := cmd.Output()
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

	for _, d := range list {
		name, _ := d["Name"].(string)
		pnp, _ := d["PNPDeviceID"].(string)

		serial := "UNKNOWN"
		if strings.Contains(pnp, "\\") {
			parts := strings.Split(pnp, "\\")
			serial = parts[len(parts)-1]
		}

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

		sendLog(LogEntry{
			DeviceID:     deviceID,
			DeviceName:   deviceName, // Use actual device name, not USB device name
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
}

func sendSystemLogs() {
	if deviceID == "" || isQuarantined {
		return
	}

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
		cmd := exec.Command("powershell", "-Command",
			fmt.Sprintf("Get-EventLog -LogName %s -Newest 10 -ErrorAction SilentlyContinue | "+
				"Select-Object Message, EventID, EntryType, @{Name='TimeGenerated'; Expression={$_.TimeGenerated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')}}, Source | "+
				"ConvertTo-Json", source.logName))

		out, err := cmd.Output()
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
	if isQuarantined {
		s["status"] = "quarantined"
		s["security_status"] = "critical"
	}

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

	// Quarantine monitor
	go func() {
		for {
			checkQuarantineStatus()
			time.Sleep(CHECK_QUARANTINE_INTERVAL)
		}
	}()

	// Main loop
	for {
		trackUSBDevices()
		sendSystemLogs()
		updateDeviceStatus()
		time.Sleep(POLL_INTERVAL)
	}
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
