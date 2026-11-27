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

  it.each([
    '64:ff9b::c0a8:101', // NAT64 private IPv4
    '64:ff9b::7f00:1', // NAT64 loopback
    '64:ff9b::a9fe:a9fe', // NAT64 well-known prefix
    '64:ff9b:1::a9fe:a9fe', // NAT64 local-use prefix
    '2002:a9fe:a9fe::', // 6to4
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
    '::ffff:0:169.254.169.254', // RFC 6145 translation
    'ff02::1', // multicast
    'fe80::1', // link-local
    '2001:db8::1', // documentation/reserved
    '224.0.0.1', // IPv4 multicast
    '100.64.0.1', // carrier-grade NAT
    '::ffff:100.64.0.1', // IPv4-mapped carrier-grade NAT
  ])('blocks unsafe address %s', address => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808'])(
    'allows public unicast %s',
    address => {
      expect(isBlockedIp(address)).toBe(false);
    },
  );
});
