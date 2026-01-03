// app/api/agent-log/route.ts
// Dedicated endpoint for agents to send logs without user authentication
// Uses service role key for authorization

import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCorsHeaders, verifyAgentKey, unauthorizedResponse } from "@/lib/api-utils";

const logSchema = z.object({
    device_id: z.string().min(1),
    log_type: z.enum(['hardware', 'software', 'network', 'security', 'system', 'usb', 'application', 'network_topology']).transform(val => val.toLowerCase()),
    source: z.string().optional(),
    severity: z.string().optional(),
    message: z.string().max(5000),
    event_code: z.string().optional(),
    timestamp: z.string().optional(),
    raw_data: z.any().optional(),
    hardware_type: z.string().optional(),
    event: z.string().optional(),
    device_name: z.string().optional(),
    hostname: z.string().optional(),
    owner: z.string().optional(),
});

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(request, 'POST, OPTIONS'),
    });
}

export async function POST(request: NextRequest) {
    const headers = getCorsHeaders(request, 'POST, OPTIONS');
    try {
        // SECURITY: Verify Agent Secret Key (Fails shut if not configured)
        if (!verifyAgentKey(request)) {
            console.error("[AGENT-LOG] Unauthorized agent access attempt or server misconfigured");
            return unauthorizedResponse(headers);
        }
        // Use admin client (bypasses RLS)
        const supabase = createAdminClient();

        const body = await request.json();

        const validationResult = logSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Validation failed", details: validationResult.error.format() },
                { status: 400, headers }
            );
        }

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
            owner,
        } = validationResult.data;

        // Verify device exists
        const { data: deviceExists } = await supabase
            .from("devices")
            .select("id")
            .eq("id", device_id)
            .maybeSingle();

        if (!deviceExists) {
            // Auto-register device
            await supabase.from("devices").insert([{
                id: device_id,
                device_name: device_name || hostname || "Unknown Device",
                device_type: "windows",
                owner: owner || null,
                hostname: hostname || "unknown-host",
                readable_id: `Device-${crypto.randomUUID().slice(0, 8)}`,
                status: "online",
                security_status: "secure",
                is_quarantined: false,
                last_seen: new Date().toISOString(),
                agent_version: "auto-registered",
            }]);
        } else {
            // Update last_seen
            await supabase
                .from("devices")
                .update({
                    last_seen: new Date().toISOString(),
                    status: "online"
                })
                .eq("id", device_id);
        }

        // Insert log (truncate message if too long for database)
        const truncatedMessage = message.length > 5000
            ? message.substring(0, 4997) + '...'
            : message;

        const { data: logData, error: logError } = await supabase
            .from("logs")
            .insert([{
                device_id,
                log_type,
                source: source || "windows-agent",
                severity: severity || "info",
                message: truncatedMessage,
                event_code,
                timestamp: (timestamp && !isNaN(Date.parse(timestamp))) ? new Date(timestamp).toISOString() : new Date().toISOString(),
                raw_data,
                hardware_type,
                event,
            }])
            .select()
            .single();

        if (logError) {
            console.error("[AGENT-LOG] Error inserting log:", logError);
            return NextResponse.json({
                error: "Failed to create log",
                details: logError.message
            }, { status: 500, headers });
        }

        return NextResponse.json({
            success: true,
            log_id: logData?.id,
            message: "Log created successfully"
        }, { status: 201, headers });

    } catch (error: any) {
        console.error("[AGENT-LOG] API error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                details: error?.message || "Unknown error"
            },
            { status: 500, headers }
        );
    }
}
