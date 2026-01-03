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

export async function POST(request: Request) {
    try {
        // Authentication
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
