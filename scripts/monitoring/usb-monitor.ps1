# === Configuration ===
$vercelUrl = "https://v0-project1-r9.vercel.app"   # 🔹 replace with your deployed Vercel domain
$apiEndpoint = "$vercelUrl/api/devices/usb"

# Register for USB insertion/removal events
Register-WmiEvent -Query "SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3" -Action {
    $eventType = if ($Event.SourceEventArgs.NewEvent.EventType -eq 2) { "usb_insert" } else { "usb_remove" }
    $timestamp = (Get-Date).ToString("o")

    Write-Host "[INFO] USB Event: $eventType at $timestamp"

    $body = @{
        event = $eventType
        timestamp = $timestamp
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri $using:apiEndpoint -Method POST -ContentType "application/json" -Body $body | Out-Null
    } catch {
        Write-Warning "Failed to send USB alert to Vercel: $($_.Exception.Message)"
    }
}