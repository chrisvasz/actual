import ipaddr from 'ipaddr.js';

// IP ranges (as classified by ipaddr.js) that are never a legitimate
// destination for a server-side request: link-local (which covers the cloud
// metadata endpoint, 169.254.169.254), unspecified, reserved, broadcast, and
// the private-network ranges (LAN, loopback, IPv6 unique-local).
const BLOCKED_IP_RANGES = [
  'linkLocal',
  'unspecified',
  'reserved',
  'broadcast',
  'private',
  'loopback',
  'uniqueLocal',
];

/**
 * Return true if the given address is a literal IP in one of the blocked
 * ranges. Non-IP strings (e.g. hostnames) return false, so callers can pass a
 * URL hostname directly.
 */
export function isBlockedIp(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  // process() normalizes IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  // back to their IPv4 form so their range is classified correctly.
  const range = ipaddr.process(address).range();

  return BLOCKED_IP_RANGES.includes(range);
}
