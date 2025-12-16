import snmp from 'net-snmp';

// Strict Type Definitions
interface SNMPSession {
    get(oids: string[], callback: (error: Error | null, varbinds: any[]) => void): void;
    close(): void;
    // Add other methods if needed (walk, etc) use 'any' if not strictly needed for this specific impl
    // but the user requested better types.
}

interface NetworkDevice {
    ip: string;
    hostname: string;
    type: 'router' | 'switch' | 'wireless-ap' | 'firewall' | 'server' | 'unknown';
    vendor: string;
    model: string;
    macAddress: string;
    uptime: number;
    location: string;
    status: 'online' | 'offline' | 'unknown';
    lastSeen: Date;
    description?: string;
}

interface SNMPConfig {
    communityStrings: string[];
    timeout: number;
    retries: number;
    maxConcurrent: number;
}

export class SNMPDiscoveryService {
    private config: SNMPConfig;

    constructor(config?: Partial<SNMPConfig>) {
        this.config = {
            communityStrings: config?.communityStrings || ['public'],
            timeout: config?.timeout || 5000,
            retries: config?.retries || 2,
            maxConcurrent: config?.maxConcurrent || 50
        };
    }

    /**
     * Discover a single device with retry logic
     */
    async discoverDevice(ipAddress: string): Promise<NetworkDevice | null> {
        for (const community of this.config.communityStrings) {
            // Retry logic per community string with Exponential Backoff
            for (let attempt = 0; attempt <= this.config.retries; attempt++) {
                try {
                    const device = await this.attemptDiscovery(ipAddress, community);
                    if (device) return device;
                } catch (error) {
                    // Last attempt failed?
                    if (attempt === this.config.retries) {
                        // Move to next community string or fail
                        break;
                    }

                    // Exponential backoff
                    const backoff = 500 * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }
            }
        }
        return null;
    }

    /**
     * Attempt discovery with specific community string
     */
    private attemptDiscovery(ipAddress: string, community: string): Promise<NetworkDevice | null> {
        return new Promise((resolve, reject) => {
            // Explicitly cast to custom interface for type safety
            const session = snmp.createSession(ipAddress, community, {
                version: snmp.Version2c,
                timeout: this.config.timeout,
                retries: 0 // We handle retries manually
            }) as SNMPSession;

            // Standard SNMP OIDs
            const oids = [
                '1.3.6.1.2.1.1.1.0',    // sysDescr
                '1.3.6.1.2.1.1.5.0',    // sysName (hostname)
                '1.3.6.1.2.1.1.3.0',    // sysUpTime
                '1.3.6.1.2.1.1.6.0',    // sysLocation
                '1.3.6.1.2.1.2.2.1.6.1' // ifPhysAddress (MAC)
            ];

            const timeout = setTimeout(() => {
                session.close();
                reject(new Error('SNMP timeout'));
            }, this.config.timeout + 1000);

            session.get(oids, (error: any, varbinds: any[]) => {
                clearTimeout(timeout);
                session.close();

                if (error) {
                    reject(error);
                    return;
                }

                // Validate we got meaningful data
                if (!varbinds || varbinds.length === 0) {
                    reject(new Error('No SNMP data'));
                    return;
                }

                try {
                    const sysDescr = this.extractValue(varbinds[0]);
                    const sysName = this.extractValue(varbinds[1]);
                    const sysUpTime = this.extractValue(varbinds[2]);
                    const sysLocation = this.extractValue(varbinds[3]);
                    const macAddress = this.extractMAC(varbinds[4]);

                    const device: NetworkDevice = {
                        ip: ipAddress,
                        hostname: sysName || ipAddress,
                        type: this.detectDeviceType(sysDescr),
                        vendor: this.extractVendor(sysDescr),
                        model: this.extractModel(sysDescr),
                        macAddress: macAddress || 'Unknown',
                        uptime: this.parseUptime(sysUpTime),
                        location: sysLocation || 'Unknown',
                        status: 'online',
                        lastSeen: new Date(),
                        description: sysDescr
                    };

                    resolve(device);
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
    }

    /**
     * Scan entire subnet with concurrent connections
     */
    async scanSubnet(subnet: string, progressCallback?: (progress: number) => void): Promise<NetworkDevice[]> {
        const [baseIP, cidr] = subnet.split('/');
        const cidrNum = parseInt(cidr);

        if (cidrNum < 16 || cidrNum > 30) {
            throw new Error('CIDR must be between /16 and /30 for safety');
        }

        const hosts = this.generateIPRange(baseIP, cidrNum);
        const devices: NetworkDevice[] = [];
        const total = hosts.length;
        let completed = 0;

        // Process in batches
        for (let i = 0; i < hosts.length; i += this.config.maxConcurrent) {
            const batch = hosts.slice(i, i + this.config.maxConcurrent);

            const results = await Promise.allSettled(
                batch.map(ip => this.discoverDevice(ip))
            );

            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    devices.push(result.value);
                }
            });

            completed += batch.length;
            if (progressCallback) {
                progressCallback(Math.round((completed / total) * 100));
            }
        }

        return devices;
    }

    /**
     * Generate IP range from CIDR
     */
    private generateIPRange(baseIP: string, cidr: number): string[] {
        const parts = baseIP.split('.').map(Number);
        const hostBits = 32 - cidr;
        const numHosts = Math.pow(2, hostBits) - 2; // Exclude network & broadcast

        const ips: string[] = [];
        const baseNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

        for (let i = 1; i <= numHosts; i++) {
            const num = baseNum + i;
            const ip = [
                (num >>> 24) & 0xff,
                (num >>> 16) & 0xff,
                (num >>> 8) & 0xff,
                num & 0xff
            ].join('.');
            ips.push(ip);
        }

        return ips;
    }

    /**
     * Extract value from SNMP varbind
     */
    private extractValue(varbind: any): string {
        if (!varbind || !varbind.value) return '';

        if (Buffer.isBuffer(varbind.value)) {
            return varbind.value.toString('utf8');
        }
        return String(varbind.value);
    }

    /**
     * Extract and format MAC address
     */
    private extractMAC(varbind: any): string {
        if (!varbind || !varbind.value) return 'Unknown';

        if (Buffer.isBuffer(varbind.value)) {
            return Array.from(varbind.value as Buffer)
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join(':')
                .toUpperCase();
        }
        return 'Unknown';
    }

    /**
     * Parse uptime from timeticks (centiseconds)
     */
    private parseUptime(uptimeStr: string): number {
        const timeticks = parseInt(uptimeStr);
        return isNaN(timeticks) ? 0 : timeticks / 100; // Convert to seconds
    }

    /**
     * Detect device type from sysDescr
     */
    private detectDeviceType(sysDescr: string): NetworkDevice['type'] {
        const desc = sysDescr?.toLowerCase() || '';

        if (desc.includes('wireless') || desc.includes('access point') || desc.includes(' ap ')) {
            return 'wireless-ap';
        }
        if (desc.includes('firewall') || desc.includes('asa') || desc.includes('fortigate')) {
            return 'firewall';
        }
        if (desc.includes('router') || desc.includes('gateway')) {
            return 'router';
        }
        if (desc.includes('switch') || desc.includes('catalyst')) {
            return 'switch';
        }
        if (desc.includes('linux') || desc.includes('windows') || desc.includes('server')) {
            return 'server';
        }

        return 'unknown';
    }

    /**
     * Extract vendor from sysDescr
     */
    private extractVendor(sysDescr: string): string {
        const vendors = [
            'Cisco', 'Juniper', 'HP', 'HPE', 'Aruba', 'Ubiquiti',
            'MikroTik', 'Huawei', 'Dell', 'Netgear', 'TP-Link',
            'Fortinet', 'Palo Alto', 'Meraki'
        ];

        for (const vendor of vendors) {
            if (sysDescr?.includes(vendor)) return vendor;
        }
        return 'Unknown';
    }

    /**
     * Extract model from sysDescr
     */
    private extractModel(sysDescr: string): string {
        // Common patterns: "Cisco IOS Software, C2960 Software"
        const modelMatch = sysDescr?.match(/[A-Z]{1,2}\d{4}[A-Z]?/);
        if (modelMatch) return modelMatch[0];

        // Fallback: take second word
        const words = sysDescr?.split(' ').filter(w => w.length > 2);
        return words?.[1] || 'Unknown';
    }

    /**
     * Get device details (additional OIDs)
     */
    async getDeviceDetails(ipAddress: string, community?: string): Promise<any> {
        const comm = community || this.config.communityStrings[0];

        return new Promise((resolve, reject) => {
            const session = snmp.createSession(ipAddress, comm, {
                version: snmp.Version2c,
                timeout: this.config.timeout
            });

            const detailOids = [
                '1.3.6.1.2.1.1.2.0',    // sysObjectID
                '1.3.6.1.2.1.1.4.0',    // sysContact
                '1.3.6.1.2.1.2.1.0',    // ifNumber (interface count)
                '1.3.6.1.2.1.25.1.1.0', // hrSystemUptime
            ];

            session.get(detailOids, (error: any, varbinds: any[]) => {
                session.close();

                if (error) {
                    reject(error);
                    return;
                }

                resolve({
                    objectID: this.extractValue(varbinds[0]),
                    contact: this.extractValue(varbinds[1]),
                    interfaceCount: parseInt(this.extractValue(varbinds[2])) || 0,
                    systemUptime: this.extractValue(varbinds[3])
                });
            });
        });
    }
}

// Factory function for easy instantiation
export function createSNMPService(config?: Partial<SNMPConfig>) {
    return new SNMPDiscoveryService(config);
}

// Utility: Test connection before scanning
export async function testSNMPConnection(ip: string, community: string = 'public'): Promise<boolean> {
    const service = new SNMPDiscoveryService({
        communityStrings: [community],
        timeout: 2000,
        retries: 1
    });

    try {
        const device = await service.discoverDevice(ip);
        return device !== null;
    } catch {
        return false;
    }
}