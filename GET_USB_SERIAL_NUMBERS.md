# How to Get USB Serial Numbers for Whitelist

To add USB devices to the whitelist, you need their serial numbers. Here's how to get them on different platforms:

## Windows

### Method 1: PowerShell (Recommended)
```powershell
# Get all USB devices with serial numbers
Get-WmiObject Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like "*USBSTOR*" } | 
    Select-Object Name, PNPDeviceID | Format-List

# Extract serial number from PNPDeviceID
# Serial number is usually the last part after the backslash
```

### Method 2: Device Manager
1. Open Device Manager
2. Expand "Disk drives" or "Universal Serial Bus controllers"
3. Right-click USB device → Properties → Details tab
4. Select "Device instance path" or "Hardware Ids"
5. Look for serial number in the path (usually after the last backslash)

### Method 3: Using Enhanced Agent
The enhanced agent automatically captures USB serial numbers when devices are connected. Check the logs in the dashboard to see the serial numbers of connected devices.

## Linux

### Method 1: Using lsusb
```bash
# List USB devices
lsusb -v | grep -i serial

# Or for specific device
lsusb -v -d VENDOR_ID:PRODUCT_ID | grep -i serial
```

### Method 2: Using udevadm
```bash
# List USB devices with details
udevadm info -a -n /dev/sdb | grep SERIAL

# Replace /dev/sdb with your USB device path
```

### Method 3: Using dmesg
```bash
# Check recent USB connections
dmesg | grep -i usb | tail -20

# Look for serial numbers in the output
```

## Getting Serial Number from Dashboard

1. Connect the USB device to a monitored machine
2. Go to Dashboard → Select the device
3. Check "USB Activity" section
4. The serial number will be displayed in the event details
5. Copy the serial number and add it to the whitelist

## Adding to Whitelist

Once you have the serial number:

1. Navigate to **USB Whitelist** page
2. Click **"Add Authorized USB"**
3. Enter:
   - **Serial Number** (required) - e.g., "ABC123XYZ"
   - **Device Name** (required) - e.g., "SanDisk USB Drive"
   - **Vendor ID** (optional) - e.g., "0781"
   - **Product ID** (optional) - e.g., "5583"
   - **Vendor Name** (optional) - e.g., "SanDisk"
   - **Description** (optional) - e.g., "Company USB #1"
4. Click **"Add to Whitelist"**

## Example Serial Numbers Format

Serial numbers can vary in format:
- `ABC123XYZ`
- `4C530001020304050607`
- `00000000000000000000` (some devices don't have serial numbers)
- `WD-WX51A1234567` (Western Digital format)

**Note:** If a USB device doesn't have a serial number (shows as "UNKNOWN"), it will trigger a moderate severity alert when connected.

## Bulk Import (Future Enhancement)

For bulk importing multiple USB devices, you can use SQL:

```sql
INSERT INTO authorized_usb_devices (serial_number, device_name, vendor_name, is_active)
VALUES 
  ('SERIAL001', 'USB Drive 1', 'SanDisk', true),
  ('SERIAL002', 'USB Drive 2', 'Kingston', true),
  ('SERIAL003', 'USB Drive 3', 'SanDisk', true);
```

## Testing

After adding a USB to the whitelist:

1. Disconnect the USB (if connected)
2. Reconnect the USB
3. Check Dashboard → Alerts
4. Should see "Authorized USB Device Connected" (low severity) instead of "Unauthorized USB Device Detected" (critical)

## Troubleshooting

**Serial number not found:**
- Some USB devices don't have serial numbers
- Try using Vendor ID + Product ID combination
- Check device documentation

**Serial number format mismatch:**
- Serial numbers are case-sensitive
- Remove any spaces or special characters
- Use exact format from device manager/logs

**USB still showing as unauthorized:**
- Verify serial number matches exactly (case-sensitive)
- Check if USB is marked as `is_active = true`
- Check device logs for the actual serial number used

