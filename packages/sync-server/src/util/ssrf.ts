import ipaddr from 'ipaddr.js';

const NAT64_PREFIX = ipaddr.IPv6.parseCIDR('64:ff9b::/96');

/**
 * Return true if the given address is a literal IP that is not a legitimate
 * destination for a server-side request. Only public unicast is allowed:
 * private, loopback, link-local (which covers the cloud metadata endpoint,
 * 169.254.169.254), carrier-grade NAT, multicast, reserved and IPv6
 * transition addresses are all blocked, except public IPv4 reached through
 * the well-known NAT64 prefix. Non-IP strings (e.g. hostnames) return false,
 * so callers can pass a URL hostname directly.
 */
export function isBlockedIp(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  // process() normalizes IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  // back to their IPv4 form so their range is classified correctly.
  const parsed = ipaddr.process(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.match(NAT64_PREFIX)) {
    // The well-known NAT64 prefix is only for globally routable IPv4.
    return (
      ipaddr.fromByteArray(parsed.toByteArray().slice(12)).range() !== 'unicast'
    );
  }

  return parsed.range() !== 'unicast';
}
