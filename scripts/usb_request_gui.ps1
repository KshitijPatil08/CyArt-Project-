# USB Device Whitelist Request - GUI Version (Stable)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:API_URL = "https://v0-project1-r9.vercel.app/api/usb/request" # UPDATE THIS

# Get Machine ID for tracking
try {
    $script:MACHINE_ID = (Get-CimInstance -Class Win32_ComputerSystemProduct).UUID
    if ([string]::IsNullOrWhiteSpace($script:MACHINE_ID)) {
        $script:MACHINE_ID = "UNKNOWN-MACHINE-ID"
    }
    $script:MACHINE_ID = $script:MACHINE_ID.Trim()
} catch {
    $script:MACHINE_ID = "UNKNOWN-MACHINE-ID"
}

# Create the main form
$form = New-Object System.Windows.Forms.Form
$form.Text = "USB Whitelist Request"
$form.Size = New-Object System.Drawing.Size(800, 600)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::White

# Title Label
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Location = New-Object System.Drawing.Point(20, 20)
$titleLabel.Size = New-Object System.Drawing.Size(740, 30)
$titleLabel.Text = "Select a USB device to request whitelist access:"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($titleLabel)

# DataGridView for USB devices
$dataGrid = New-Object System.Windows.Forms.DataGridView
$dataGrid.Location = New-Object System.Drawing.Point(20, 60)
$dataGrid.Size = New-Object System.Drawing.Size(740, 300)
$dataGrid.AllowUserToAddRows = $false
$dataGrid.AllowUserToDeleteRows = $false
$dataGrid.ReadOnly = $true
$dataGrid.SelectionMode = "FullRowSelect"
$dataGrid.MultiSelect = $false
$dataGrid.BackgroundColor = [System.Drawing.Color]::White
$dataGrid.BorderStyle = "Fixed3D"
$dataGrid.RowHeadersVisible = $false
$dataGrid.AutoSizeColumnsMode = "Fill"
$form.Controls.Add($dataGrid)

# Status TextBox
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(20, 370)
$statusLabel.Size = New-Object System.Drawing.Size(740, 20)
$statusLabel.Text = "Status:"
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($statusLabel)

$statusBox = New-Object System.Windows.Forms.TextBox
$statusBox.Location = New-Object System.Drawing.Point(20, 395)
$statusBox.Size = New-Object System.Drawing.Size(740, 100)
$statusBox.Multiline = $true
$statusBox.ScrollBars = "Vertical"
$statusBox.ReadOnly = $true
$statusBox.BackColor = [System.Drawing.Color]::FromArgb(240, 240, 240)
$statusBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($statusBox)

# Buttons
$submitButton = New-Object System.Windows.Forms.Button
$submitButton.Location = New-Object System.Drawing.Point(500, 510)
$submitButton.Size = New-Object System.Drawing.Size(120, 35)
$submitButton.Text = "Submit Request"
$submitButton.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 212)
$submitButton.ForeColor = [System.Drawing.Color]::White
$submitButton.FlatStyle = "Flat"
$submitButton.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$submitButton.Enabled = $false
$form.Controls.Add($submitButton)

$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Location = New-Object System.Drawing.Point(360, 510)
$refreshButton.Size = New-Object System.Drawing.Size(120, 35)
$refreshButton.Text = "Refresh Devices"
$refreshButton.BackColor = [System.Drawing.Color]::FromArgb(100, 100, 100)
$refreshButton.ForeColor = [System.Drawing.Color]::White
$refreshButton.FlatStyle = "Flat"
$refreshButton.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($refreshButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(640, 510)
$closeButton.Size = New-Object System.Drawing.Size(120, 35)
$closeButton.Text = "Close"
$closeButton.BackColor = [System.Drawing.Color]::FromArgb(200, 50, 50)
$closeButton.ForeColor = [System.Drawing.Color]::White
$closeButton.FlatStyle = "Flat"
$closeButton.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($closeButton)

# Function to load USB devices
function Load-USBDevices {
    $statusBox.Text = "Scanning for USB devices...`r`n"
    $statusBox.ForeColor = [System.Drawing.Color]::Black
    $dataGrid.Rows.Clear()
    
    try {
        $usbDevices = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "^USB" }
        
        if ($usbDevices.Count -eq 0) {
            $statusBox.Text += "No USB devices found.`r`n"
            $submitButton.Enabled = $false
            return
        }
        
        if ($dataGrid.Columns.Count -eq 0) {
            $dataGrid.Columns.Add("DeviceName", "Device Name") | Out-Null
            $dataGrid.Columns.Add("Class", "Class") | Out-Null
            $dataGrid.Columns.Add("Status", "Status") | Out-Null
            $dataGrid.Columns.Add("InstanceID", "Instance ID") | Out-Null
            $dataGrid.Columns["InstanceID"].Visible = $false
        }
        
        foreach ($dev in $usbDevices) {
            $row = $dataGrid.Rows.Add()
            $dataGrid.Rows[$row].Cells["DeviceName"].Value = $dev.FriendlyName
            $dataGrid.Rows[$row].Cells["Class"].Value = $dev.Class
            $dataGrid.Rows[$row].Cells["Status"].Value = $dev.Status
            $dataGrid.Rows[$row].Cells["InstanceID"].Value = $dev.InstanceId
            $dataGrid.Rows[$row].Tag = $dev
        }
        
        $statusBox.Text += "Found $($usbDevices.Count) USB device(s). Select one to submit a request.`r`n"
        $submitButton.Enabled = $true
        
    } catch {
        $statusBox.Text += "ERROR: Failed to scan devices. $($_.Exception.Message)`r`n"
        $submitButton.Enabled = $false
    }
}

# Submit button click handler
$submitButton.Add_Click({
    if ($dataGrid.SelectedRows.Count -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Please select a USB device first.", "No Selection", "OK", "Warning")
        return
    }
    
    $selectedRow = $dataGrid.SelectedRows[0]
    $selectedDevice = $selectedRow.Tag
    
    $statusBox.Text = "Processing request for: $($selectedDevice.FriendlyName)...`r`n"
    $statusBox.ForeColor = [System.Drawing.Color]::Black
    $submitButton.Enabled = $false
    $form.Refresh()
    
    try {
        $serialNumber = "UNKNOWN"
        if ($selectedDevice.InstanceId -match "\\([^\\]+)$") {
            $serialNumber = $matches[1].Split('&')[0]
        }
        
        $vendorId = ""
        $productId = ""
        if ($selectedDevice.InstanceId -match "VID_([0-9A-F]{4})&PID_([0-9A-F]{4})") {
            $vendorId = $matches[1]
            $productId = $matches[2]
        }
        
        $payload = @{
            serial_number = $serialNumber
            device_name   = $selectedDevice.FriendlyName
            vendor_name   = $selectedDevice.Manufacturer
            vendor_id     = $vendorId
            product_id    = $productId
            device_class  = $selectedDevice.Class
            hardware_id   = ($selectedDevice.HardwareID -join ",")
            device_id     = $script:MACHINE_ID
            computer_name = $env:COMPUTERNAME
            description   = "Request from GUI Agent"
        }
        
        $statusBox.Text += "`r`nDevice Details:`r`n"
        $statusBox.Text += "  Serial: $serialNumber`r`n"
        $statusBox.Text += "  VID/PID: $vendorId/$productId`r`n"
        $statusBox.Text += "  Machine ID: $script:MACHINE_ID`r`n"
        $statusBox.Text += "`r`nSubmitting to server...`r`n"
        $form.Refresh()
        
        $jsonPayload = $payload | ConvertTo-Json
        $response = Invoke-RestMethod -Uri $script:API_URL -Method Post -Body $jsonPayload -ContentType "application/json"
        
        if ($response.success) {
            $statusBox.Text += "`r`n✓ SUCCESS! Request submitted successfully!`r`n"
            $statusBox.ForeColor = [System.Drawing.Color]::Green
            [System.Windows.Forms.MessageBox]::Show("Request submitted successfully!", "Success", "OK", "Information")
        } else {
            $statusBox.Text += "`r`n✗ ERROR: Server returned error`r`n"
            $statusBox.Text += "$($response.error)`r`n"
            $statusBox.ForeColor = [System.Drawing.Color]::Red
            [System.Windows.Forms.MessageBox]::Show("Server error: $($response.error)", "Error", "OK", "Error")
        }
        
    } catch {
        $statusBox.Text += "`r`n✗ ERROR: Failed to connect to server`r`n"
        $statusBox.Text += "$($_.Exception.Message)`r`n"
        $statusBox.ForeColor = [System.Drawing.Color]::Red
        [System.Windows.Forms.MessageBox]::Show("Failed to connect to server: $($_.Exception.Message)", "Connection Error", "OK", "Error")
    } finally {
        $submitButton.Enabled = $true
    }
})

# Refresh button click handler
$refreshButton.Add_Click({
    Load-USBDevices
})

# Close button click handler
$closeButton.Add_Click({
    $form.Close()
})

# Load devices on startup
Load-USBDevices

# Show the form
$form.ShowDialog() | Out-Null
