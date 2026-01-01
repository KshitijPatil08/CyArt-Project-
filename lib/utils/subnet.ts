import ipaddr from 'ipaddr.js';

/**
 * Checks if an IP address is within a specific Subnet/CIDR.
 * @param ip The IP address to check (IPv4 or IPv6)
 * @param cidr The Subnet in CIDR notation (e.g., "192.168.1.0/24")
 * @returns boolean
 */
export function isIpInSubnet(ip: string, cidr: string): boolean {
  try {
    if (!ip || !cidr) return false;

    // Parse the IP address
    const parsedIp = ipaddr.parse(ip);

    // Parse the CIDR
    const parsedCidr = ipaddr.parseCIDR(cidr);

    // Check match
    return parsedIp.match(parsedCidr);
  } catch (error: any) {
    // Suppress expected errors when comparing different IP versions (e.g., IPv6 vs IPv4)
    if (error.message && error.message.includes("cannot match ipv6 address with non-ipv6 one")) {
      return false;
    }
    console.error(`Error matching IP ${ip} to CIDR ${cidr}:`, error);
    return false;
  }
}
