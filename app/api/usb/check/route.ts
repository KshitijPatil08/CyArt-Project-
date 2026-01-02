import { createAdminClient } from "@/lib/supabase/admin";
import { type NextRequest, NextResponse } from "next/server";

// GET /api/usb/check?serial_number=...&computer_name=...&device_name=...
// Used by agents to verify if a USB device is authorized and fetch its policies
export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const { searchParams } = new URL(request.url);
        const serial_number = searchParams.get("serial_number");
        const computer_name = searchParams.get("computer_name");
        const device_name = searchParams.get("device_name") || "Unknown Device";

        if (!serial_number) {
            return NextResponse.json({ error: "Missing serial_number" }, { status: 400 });
        }

        console.log(`[USB CHECK] Checking: ${device_name} (${serial_number}) for ${computer_name}`);

        // 1. Check if the COMPUTER itself is quarantined
        if (computer_name) {
            const { data: device, error: deviceError } = await supabase
                .from("devices")
                .select("is_quarantined")
                .eq("hostname", computer_name)
                .maybeSingle();

            if (!deviceError && device?.is_quarantined) {
                console.log(`[USB CHECK] Blocking USB access: Computer ${computer_name} is in QUARANTINE.`);
                return NextResponse.json({
                    authorized: false,
                    is_quarantined: true,
                    message: "USB access blocked: This computer is currently in quarantine."
                }, { status: 200 });
            }
        }

        // 2. INTEGRATED SEVERITY ENGINE - check for critical keywords
        // This ensures rules like "mass" block the device even if it's on the whitelist.
        const { data: rules } = await supabase
            .from('severity_rules')
            .select('*')
            .eq('is_active', true)
            .eq('target_severity', 'critical');

        if (rules && rules.length > 0) {
            for (const rule of rules) {
                const regex = new RegExp(rule.keyword, 'i');
                // Check both name and serial
                if (regex.test(device_name) || regex.test(serial_number)) {
                    console.log(`[USB CHECK] BLOCKING by Security Rule: "${rule.keyword}" matched "${device_name}"`);
                    return NextResponse.json({
                        authorized: false,
                        message: `Access Blocked by Security Rule: ${rule.keyword}`
                    }, { status: 200 });
                }
            }
        }

        // 3. Fetch all authorized devices to perform biometric matching
        const { data: allDevices, error: fetchError } = await supabase
            .from("authorized_usb_devices")
            .select("*")
            .eq("is_active", true);

        if (fetchError) {
            console.error("[USB CHECK] Error fetching devices:", fetchError);
            return NextResponse.json({ error: "Failed to fetch whitelist" }, { status: 500 });
        }

        // 4. Biometric matching (bi-directional STARTS WITH check)
        const matchingDevice = allDevices?.find(device => {
            if (!device.serial_number) return false;

            // STRICT MATCHING:
            // 1. Exact Match: The serial numbers match perfectly.
            // 2. Parent-Child Match: The *Whitelisted* device is a parent (short serial) of the *Connected* device.
            //    Example: Whitelist="1234", Connected="1234&0". This IS allowed.
            // 
            // PREVENTED:
            // 3. Reverse Match: The *Connected* device is a prefix of the *Whitelisted* device.
            //    Example: Whitelist="123456", Connected="1234". This is NOT allowed (prevents generic parents from unlocking specific children).

            // STRICTEST MATCHING APPLIED:
            // We FORCE exact match only.
            // Hierarchy matching (Parent-Child) is disabled because "Mass Storage" parents
            // were authorizing specific SanDisk children they shouldn't have.

            const isExactMatch = serial_number === device.serial_number;
            // const isParentMatch = serial_number.startsWith(device.serial_number); // DISABLED

            console.log(`[USB CHECK] Matching '${serial_number}' against '${device.serial_number}': Exact=${isExactMatch} (Strict Mode)`);

            // Return true only if it is an exact match
            if (isExactMatch) {
                return true;
            }
            return false;
        });

        if (!matchingDevice) {
            return NextResponse.json({
                authorized: false,
                message: "Device not found in whitelist or restricted to another computer"
            }, { status: 200 });
        }

        // 5. Return authorization status and policies
        return NextResponse.json({
            authorized: true,
            device: {
                id: matchingDevice.id,
                serial_number: matchingDevice.serial_number,
                device_name: matchingDevice.device_name,
                is_read_only: matchingDevice.is_read_only || false,
                max_daily_transfer_mb: matchingDevice.max_daily_transfer_mb || 0,
                expiration_date: matchingDevice.expiration_date || null,
                allowed_start_time: matchingDevice.allowed_start_time || null,
                allowed_end_time: matchingDevice.allowed_end_time || null
            }
        }, { status: 200 });

    } catch (error: any) {
        console.error("[USB CHECK] Internal error:", error);
        return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
    }
}

