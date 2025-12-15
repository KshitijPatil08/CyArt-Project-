import snmp from 'net-snmp';

interface NetworkDevice {
    ip: string;
    hostname: string;
    type: 'router' | 'switch' | 'wireless-ap' | 'firewall';
    vendor: string;
    model: string;
    macAddress: string;
    uptime: number;
    location: string;
    status: 'online' | 'offline' | 'unknown';
    lastSeen: Date;
}

export class SNMPDiscoveryService {
    private session: any;

    constructor(
        private community: string = 'public',
        private version: number = snmp.Version2c
    ) { }

    async discoverDevice(ipAddress: string): Promise<NetworkDevice | null> {
        return new Promise((resolve, reject) => {
            const session = snmp.createSession(ipAddress, this.community, {
                version: this.version,
                timeout: 2000 // Reduced timeout for faster scanning
            });

            // OIDs for device discovery
            const oids = [
                '1.3.6.1.2.1.1.1.0',  // sysDescr
                '1.3.6.1.2.1.1.5.0',  // sysName (hostname)
                '1.3.6.1.2.1.1.3.0',  // sysUpTime
                '1.3.6.1.2.1.1.6.0',  // sysLocation
                '1.3.6.1.2.1.2.2.1.6.1' // ifPhysAddress (MAC) - index 1 often interface 1
            ];

            session.get(oids, (error: any, varbinds: any[]) => {
                if (error) {
                    session.close();
                    resolve(null);
                    return;
                }

                const device: NetworkDevice = {
                    ip: ipAddress,
                    hostname: varbinds[1]?.value?.toString() || 'Unknown',
                    type: this.detectDeviceType(varbinds[0]?.value?.toString()),
                    vendor: this.extractVendor(varbinds[0]?.value?.toString()),
                    model: this.extractModel(varbinds[0]?.value?.toString()),
                    macAddress: this.formatMAC(varbinds[4]?.value),
                    uptime: parseInt(varbinds[2]?.value) / 100,
                    location: varbinds[3]?.value?.toString() || 'Unknown',
                    status: 'online',
                    lastSeen: new Date()
                };

                session.close();
                resolve(device);
            });
        });
    }

    async scanSubnet(subnet: string): Promise<NetworkDevice[]> {
        const devices: NetworkDevice[] = [];
        const [baseIP, cidr] = subnet.split('/');

        // Simple 24-bit subnet scanner logic
        if (cidr !== '24') {
            console.warn("Currently only /24 subnets are supported for rapid scanning");
        }

        const parts = baseIP.split('.').map(Number);
        const base = parts.slice(0, 3).join('.');

        const promises = [];
        for (let i = 1; i < 255; i++) {
            const ip = `${base}.${i}`;
            promises.push(this.discoverDevice(ip));
        }

        const results = await Promise.allSettled(promises);
        return results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => (r as PromiseFulfilledResult<NetworkDevice>).value);
    }

    private detectDeviceType(sysDescr: string): NetworkDevice['type'] {
        const desc = sysDescr?.toLowerCase() || '';
        if (desc.includes('wireless') || desc.includes('ap') || desc.includes('access point')) return 'wireless-ap';
        if (desc.includes('firewall') || desc.includes('asa')) return 'firewall';
        if (desc.includes('switch') || desc.includes('catalyst')) return 'switch';
        return 'router';
    }

    private extractVendor(sysDescr: string): string {
        const vendors = ['Cisco', 'Juniper', 'HP', 'Aruba', 'Ubiquiti', 'MikroTik', 'Huawei', 'Dell'];
        for (const vendor of vendors) {
            if (sysDescr?.includes(vendor)) return vendor;
        }
        return 'Unknown';
    }

    private extractModel(sysDescr: string): string {
        return sysDescr?.split(' ')[1] || 'Unknown';
    }

    private formatMAC(macBuffer: Buffer): string {
        if (!macBuffer) return 'Unknown';
        if (Buffer.isBuffer(macBuffer)) {
            return Array.from(macBuffer)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(':')
                .toUpperCase();
        }
        return 'Unknown';
    }
}
