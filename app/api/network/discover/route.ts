import { NextResponse } from 'next/server';
import { SNMPDiscoveryService } from '@/lib/network-discovery/snmp-service';
import { SSDPDiscoveryService } from '@/lib/network-discovery/ssdp-service';

export async function POST(request: Request) {
    try {
        const { subnet, protocol } = await request.json();

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
