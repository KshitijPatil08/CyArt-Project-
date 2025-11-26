// app/api/log/route.ts
// FIXED: Auto-registers device if missing before creating logs
// FIXED: Only creates alerts for unauthorized USB devices
// FIXED: Implemented log and alert deduplication
// FIXED: Always updates log severity to critical for unauthorized USB
// FIXED: Applies dynamic severity rules

import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { checkAndCreateAlerts } from "@/lib/alerts";
import { trackDataTransfer } from "@/lib/trackers";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      device_id,
      log_type,
      source,
      severity,
      message,
      event_code,
      timestamp,
      raw_data,
      hardware_type,
      event,
      device_name,
      hostname,
    } = body;

    if (!device_id || !log_type || !message || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: device_id, log_type, message, timestamp" },
        { status: 400 }
      );
    }

    console.log("[LOG] Received:", { device_id, log_type, hardware_type, event });

    // CRITICAL FIX: Check if device exists before creating log
    const { data: deviceExists, error: deviceCheckError } = await supabase
      .from("devices")
      .select("id, readable_id, hostname")
      .eq("id", device_id)
      .maybeSingle();

    if (deviceCheckError) {
      console.error("[LOG] Error checking device:", deviceCheckError);
      return NextResponse.json(
        { error: "Failed to verify device", details: deviceCheckError.message },
        { status: 500 }
      );
    }

    // If device doesn't exist, auto-register it
    if (!deviceExists) {
      console.log("[LOG] Device not found. Auto-registering device:", device_id);

      // Use hostname as device_name if available, otherwise use device_name but ensure it's not a USB device name
      let finalDeviceName = device_name || "Unknown Device"
      if (hostname && hostname !== "unknown-host" && hostname !== "") {
        finalDeviceName = hostname
      } else if (device_name && (
        device_name.toLowerCase().includes("usb") ||
        device_name.toLowerCase().includes("camera") ||
        device_name.toLowerCase().includes("dfu") ||
        device_name.toLowerCase().includes("printer") ||
        device_name.toLowerCase().includes("mouse") ||
        device_name.toLowerCase().includes("keyboard")
      )) {
        finalDeviceName = "Unknown Device"
      }

      // Auto-register the device with minimal info
      const { error: autoRegisterError } = await supabase
        .from("devices")
        .insert([{
          id: device_id, // Use the provided device_id
          device_name: finalDeviceName,
          device_type: "windows",
          hostname: hostname || finalDeviceName || "unknown-host",
          readable_id: `Device-${crypto.randomUUID().slice(0, 8)}`,
          status: "online",
          security_status: "secure",
          is_quarantined: false,
          last_seen: new Date().toISOString(),
          agent_version: "auto-registered",
        }]);

      if (autoRegisterError) {
        console.error("[LOG] Auto-registration failed:", autoRegisterError);
        return NextResponse.json(
          {
            error: "Device not found and auto-registration failed",
            details: autoRegisterError.message,
            hint: "Please register the device using /api/devices/register endpoint"
          },
          { status: 400 }
        );
      }

      console.log("[LOG] Device auto-registered successfully:", device_id);
    } else {
      // Device exists - update last_seen
      await supabase
        .from("devices")
        .update({
          last_seen: new Date().toISOString(),
          status: "online"
        })
        .eq("id", device_id);
    }

    // Check for duplicate logs (deduplication)
    const { data: recentLogs } = await supabase
      .from("logs")
      .select("message, timestamp, created_at")
      .eq("device_id", device_id)
      .eq("log_type", log_type)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentLogs && recentLogs.length > 0) {
      const lastLog = recentLogs[0];
      const lastLogTime = new Date(lastLog.created_at).getTime();
      const currentTime = new Date().getTime();
      const timeDiff = (currentTime - lastLogTime) / 1000; // seconds

      // If identical message and less than 60 seconds, skip
      if (lastLog.message === message && timeDiff < 60) {
        console.log("[LOG] Duplicate log detected, skipping:", message);
        return NextResponse.json({
          success: true,
          message: "Duplicate log skipped"
        }, { status: 200 });
      }
    }

    // Now safe to insert log
    const { data: logData, error: logError } = await supabase
      .from("logs")
      .insert([{
        device_id,
        log_type,
        source: source || "windows-agent",
        severity: severity || "info",
        message,
        event_code,
        timestamp: (timestamp && !isNaN(Date.parse(timestamp))) ? new Date(timestamp).toISOString() : new Date().toISOString(),
        raw_data,
        hardware_type,
        event,
      }])
      .select()
      .single();

    if (logError) {
      console.error("[LOG] Error inserting log:", logError);
      return NextResponse.json({
        error: "Failed to create log",
        details: logError.message
      }, { status: 500 });
    }

    console.log("[LOG] Log created successfully:", logData.id);

    // 2. Create device event and check USB whitelist (only if hardware event)
    if (log_type === "hardware" && hardware_type) {
      await supabase.from("device_events").insert([{
        device_id,
        device_name: device_name || "Unknown Device",
        host_name: hostname || "Unknown Host",
        device_category: hardware_type.toUpperCase(),
        event: (event || "connected").toLowerCase(),
        timestamp: new Date(timestamp).toISOString(),
      }]);

      // Check USB whitelist if it's a USB device
      if (hardware_type.toLowerCase() === "usb" && event === "connected" && raw_data) {
        const serialNumber = raw_data.serial_number;

        if (serialNumber && serialNumber !== "UNKNOWN") {
          // Check if USB is authorized
          const { data: authorizedUSB } = await supabase
            .from("authorized_usb_devices")
            .select("*")
            .eq("serial_number", serialNumber)
            .eq("is_active", true)
            .maybeSingle();

          if (!authorizedUSB) {
            // Unauthorized USB detected

            // Check for existing unresolved alert for this specific USB
            const { data: existingAlert } = await supabase
              .from("alerts")
              .select("id")
              .eq("device_id", device_id)
              .eq("id", logData.id);

          } else {
            // Authorized USB - NO ALERT, just normal log
            console.log(`[LOG] Authorized USB connected: ${serialNumber}`);
          }
        } else {
          // USB without serial number - moderate alert
          // Check for existing unresolved alert for unknown USB
          const { data: existingUnknownAlert } = await supabase
            .from("alerts")
            .select("id")
            .eq("device_id", device_id)
            .eq("alert_type", "hardware_event")
            .eq("is_resolved", false)
            .ilike("title", "%No Serial%")
            .maybeSingle();

          if (!existingUnknownAlert) {
            await supabase.from("alerts").insert([{
              device_id,
              alert_type: "hardware_event",
              severity: "moderate",
              title: "USB Device Connected (No Serial)",
              description: `USB device "${raw_data.usb_name || 'Unknown'}" connected to ${hostname || "device"} but serial number could not be determined`,
              is_read: false,
              is_resolved: false,
            }]);
          }
        }
      }
    }

    // 3. Security alerts
    await checkAndCreateAlerts(supabase, device_id, log_type, message, severity);

    // 3.5 Apply Dynamic Severity Rules
    try {
      const { data: rules } = await supabase
        .from('severity_rules')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (rules && rules.length > 0) {
        for (const rule of rules) {
          try {
            const regex = new RegExp(rule.pattern, 'i');
            if (regex.test(message)) {
              console.log(`[LOG] Applying severity rule: "${rule.name}" -> ${rule.severity_level}`);

              // Update log severity
              await supabase
                .from('logs')
                .update({ severity: rule.severity_level.toLowerCase() })
                .eq('id', logData.id);

              // If critical, create an alert
              if (rule.severity_level.toLowerCase() === 'critical') {
                await supabase.from("alerts").insert([{
                  device_id,
                  alert_type: "security_rule",
                  severity: "critical",
                  title: `Critical Security Rule: ${rule.name}`,
                  description: `Log matched critical rule "${rule.name}": ${message}`,
                  is_read: false,
                  is_resolved: false,
                }]);
              }
              break; // Stop after first match
            }
          } catch (e) {
            console.error(`[LOG] Invalid regex in rule "${rule.name}":`, e);
          }
        }
      }
    } catch (ruleError) {
      console.error("[LOG] Error applying severity rules:", ruleError);
    }

    // 4. Track data transfers
    if (log_type === "usb" && message.toLowerCase().includes("transfer")) {
      await trackDataTransfer(supabase, device_id, message, raw_data);
    }

    return NextResponse.json({
      success: true,
      log_id: logData?.id,
      message: "Log created successfully"
    }, { status: 201 });

  } catch (error: any) {
    console.error("[LOG] API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error?.message || "Unknown error"
      },
      { status: 500 }
    );
  }
}