import dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import { ApiError } from './errors.js';

// Private, loopback, link-local, and reserved IPv4 ranges that monitor targets must not resolve to.
const IPV4_BLOCKED: Array<[ipaddr.IPv4, number]> = [
  ipaddr.IPv4.parseCIDR('0.0.0.0/8'),
  ipaddr.IPv4.parseCIDR('10.0.0.0/8'),
  ipaddr.IPv4.parseCIDR('100.64.0.0/10'),
  ipaddr.IPv4.parseCIDR('127.0.0.0/8'),
  ipaddr.IPv4.parseCIDR('169.254.0.0/16'),
  ipaddr.IPv4.parseCIDR('172.16.0.0/12'),
  ipaddr.IPv4.parseCIDR('192.0.0.0/24'),
  ipaddr.IPv4.parseCIDR('192.0.2.0/24'),
  ipaddr.IPv4.parseCIDR('198.51.100.0/24'),
  ipaddr.IPv4.parseCIDR('203.0.113.0/24'),
  ipaddr.IPv4.parseCIDR('192.168.0.0/16'),
  ipaddr.IPv4.parseCIDR('198.18.0.0/15'),
  ipaddr.IPv4.parseCIDR('224.0.0.0/4'),
  ipaddr.IPv4.parseCIDR('240.0.0.0/4'),
  ipaddr.IPv4.parseCIDR('255.255.255.255/32'),
];

// Private and reserved IPv6 ranges. IPv4-mapped (::ffff:0:0/96) is
// handled separately — we extract the embedded IPv4 and re-check.
const IPV6_BLOCKED: Array<[ipaddr.IPv6, number]> = [
  ipaddr.IPv6.parseCIDR('::/128'),
  ipaddr.IPv6.parseCIDR('::1/128'),
  ipaddr.IPv6.parseCIDR('fc00::/7'),
  ipaddr.IPv6.parseCIDR('fe80::/10'),
  ipaddr.IPv6.parseCIDR('ff00::/8'),
];

function isIPv4Blocked(addr: ipaddr.IPv4): boolean {
  return IPV4_BLOCKED.some((range) => addr.match(range));
}

function isIPv6Blocked(addr: ipaddr.IPv6): boolean {
  if (addr.isIPv4MappedAddress()) {
    return isIPv4Blocked(addr.toIPv4Address());
  }
  return IPV6_BLOCKED.some((range) => addr.match(range));
}

function isAddressBlocked(raw: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(raw);
  } catch {
    // Unparseable address from the resolver — refuse on the safe side.
    return true;
  }
  return parsed.kind() === 'ipv4'
    ? isIPv4Blocked(parsed as ipaddr.IPv4)
    : isIPv6Blocked(parsed as ipaddr.IPv6);
}

/**
 * Validates a URL for use as a monitor target. Throws an `ApiError('URL_BLOCKED', …)`
 * if the URL is malformed, not HTTPS, or resolves to any blocked private/reserved address.
 * Called on the initial URL and every redirect hop to prevent SSRF.
 */
export async function urlGuard(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError('URL_BLOCKED', 'URL is malformed');
  }

  if (parsed.protocol !== 'https:') {
    throw new ApiError('URL_BLOCKED', 'Only https:// URLs are allowed');
  }

  // Strip brackets from raw IPv6 hostnames (e.g. "[::1]" → "::1").
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!host) {
    throw new ApiError('URL_BLOCKED', 'URL host is missing');
  }

  // Literal IP hostnames must be checked directly — dns.lookup will still
  // resolve them, but doing the check up front avoids a redundant lookup
  // and a friendlier message.
  if (ipaddr.isValid(host)) {
    if (isAddressBlocked(host)) {
      throw new ApiError('URL_BLOCKED', 'URL resolves to a blocked address');
    }
    return;
  }

  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ApiError('URL_BLOCKED', 'URL hostname could not be resolved');
  }

  if (addrs.length === 0) {
    throw new ApiError('URL_BLOCKED', 'URL hostname could not be resolved');
  }

  for (const { address } of addrs) {
    if (isAddressBlocked(address)) {
      throw new ApiError('URL_BLOCKED', 'URL resolves to a blocked address');
    }
  }
}
