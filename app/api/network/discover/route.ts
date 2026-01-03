import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SNMPDiscoveryService } from '@/lib/network-discovery/snmp-service';
import { SSDPDiscoveryService } from '@/lib/network-discovery/ssdp-service';
import { z } from 'zod';

// Input Validation Schema
const scanSchema = z.object({
    subnet: z.string().regex(
        /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/,
        "Invalid CIDR format (e.g. 192.168.1.0/24)"
    ).optional(),
    protocol: z.enum(['snmp', 'ssdp', 'lldp'])
});

// Simple In-Memory Rate Limiter (Note: Resets on server restart/lambda cold start)
// In production, use Redis (e.g., Upstash) for distributed state.
const rateLimitMap = new Map<string, number>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const lastReqTime = rateLimitMap.get(ip) || 0;

    // Cleanup old entries (simple)
    if (now - lastReqTime > WINDOW_MS) {
        rateLimitMap.delete(ip);
    }

    // Count requests (simplified for demo: just store count in value if we want strict counting, 
    // but let's just use timestamp for now to enforce interval? No, user wants rate limit.
    // Proper implementation needs {count, startTime}. Let's do simple leaky bucket or fixed window.)

    // Actually, let's keep it simple: Map<IP, {count, startTime}>
    // But for this patch, let's just allow it for now and verify logic.
    // ... refactoring to simple valid implementation:

    return true; // Placeholder for logic inside handler to avoid global state complexity here
}

const rateLimit = new Map<string, { count: number, resetTime: number }>();

export async function POST(request: Request) {
    try {
        // 1. Rate Limiting
        const ip = request.headers.get('x-forwarded-for') || 'unknown';
        const now = Date.now();
        const limitData = rateLimit.get(ip) || { count: 0, resetTime: now + WINDOW_MS };

        if (now > limitData.resetTime) {
            limitData.count = 0;
            limitData.resetTime = now + WINDOW_MS;
        }

        if (limitData.count >= MAX_REQUESTS) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        limitData.count++;
        rateLimit.set(ip, limitData);

        // 2. Authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Optional: Check Role (if using custom claims or metadata)
        // const role = user.user_metadata?.role;
        // if (role !== 'admin') { ... }

        // 3. Input Validation
        const body = await request.json();
        const parseResult = scanSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.errors }, { status: 400 });
        }

        const { subnet, protocol } = parseResult.data;

        if (protocol === 'snmp') {
            const snmpService = new SNMPDiscoveryService();
            // Use provided subnet or default
            const scanSubnet = subnet || '192.168.1.0/24';
            const devices = await snmpService.scanSubnet(scanSubnet);
            return NextResponse.json({ success: true, devices });
        }

        if (protocol === 'ssdp') {
            const ssdpService = new SSDPDiscoveryService();
            const devices = await ssdpService.discover(5000);
            return NextResponse.json({ success: true, devices });
        }

        // Agent LLDP is passive, not triggered here, but we could query DB for LLDP logs
        if (protocol === 'lldp') {
            // Placeholder: logic to fetch LLDP logs from DB
            return NextResponse.json({ success: true, message: "LLDP is passively monitored by Agents. Check Network Topology." });
        }

        return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    } catch (error) {
        console.error("Discovery Error:", error);
        return NextResponse.json({ error: 'Discovery failed' }, { status: 500 });
    }
}
