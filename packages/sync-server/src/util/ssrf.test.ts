import { describe, expect, it } from 'vitest';

import { isBlockedIp } from './ssrf';

describe('isBlockedIp', () => {
  it('allows a public literal IP', () => {
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });

  it('ignores hostnames', () => {
    expect(isBlockedIp('example.com')).toBe(false);
  });

  it('blocks the cloud metadata endpoint (link-local)', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
  });

  it('blocks reserved, broadcast and unspecified ranges', () => {
    expect(isBlockedIp('240.0.0.1')).toBe(true);
    expect(isBlockedIp('255.255.255.255')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
  });

  it('blocks loopback and private IPs', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
  });

  it('blocks IPv6 loopback and unique-local addresses', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
  });
});
