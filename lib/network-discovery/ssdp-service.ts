import dgram from 'dgram';

export class SSDPDiscoveryService {
    private socket: dgram.Socket;
    private devices: Map<string, any> = new Map();

    constructor() {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    }

    async discover(duration: number = 5000): Promise<any[]> {
        return new Promise((resolve) => {
            const SSDP_PORT = 1900;
            const SSDP_ADDR = '239.255.255.250';

            const message = Buffer.from(
                'M-SEARCH * HTTP/1.1\r\n' +
                `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 3\r\n' +
                'ST: ssdp:all\r\n\r\n'
            );

            this.socket.on('message', (msg, rinfo) => {
                const response = msg.toString();
                // Check for 200 OK or NOTIFY
                if (response.includes('HTTP/1.1 200 OK') || response.includes('NOTIFY * HTTP/1.1')) {
                    this.parseDevice(response, rinfo.address);
                }
            });

            this.socket.bind(0, () => {
                // this.socket.addMembership(SSDP_ADDR); // Not strictly necessary for sending M-SEARCH, but good for listening
                this.socket.setBroadcast(true);
                this.socket.send(message, 0, message.length, SSDP_PORT, SSDP_ADDR);
            });

            setTimeout(() => {
                try {
                    this.socket.close();
                } catch (e) {
                    // Ignore if already closed
                }
                resolve(Array.from(this.devices.values()));
            }, duration);
        });
    }

    private parseDevice(response: string, ip: string) {
        const locationMatch = response.match(/LOCATION: (.+)/i);
        const serverMatch = response.match(/SERVER: (.+)/i);
        const stMatch = response.match(/ST: (.+)/i);
        const usnMatch = response.match(/USN: (.+)/i);

        // Dedup by IP
        if (!this.devices.has(ip)) {
            this.devices.set(ip, {
                ip,
                location: locationMatch?.[1]?.trim() || 'Unknown',
                server: serverMatch?.[1]?.trim() || 'Unknown',
                serviceType: stMatch?.[1]?.trim() || 'Unknown',
                usn: usnMatch?.[1]?.trim() || 'Unknown',
                type: 'wireless-ap', // Default assumption for SSDP/UPnP devices in this context
                vendor: this.guessVendor(serverMatch?.[1] || ''),
                status: 'online',
                lastSeen: new Date()
            });
        }
    }

    private guessVendor(server: string): string {
        const s = server.toLowerCase();
        if (s.includes('linux')) return 'Linux/Generic';
        if (s.includes('windows')) return 'Windows';
        if (s.includes('cisco')) return 'Cisco';
        if (s.includes('tplink')) return 'TP-Link';
        if (s.includes('netgear')) return 'Netgear';
        return 'Unknown';
    }
}
