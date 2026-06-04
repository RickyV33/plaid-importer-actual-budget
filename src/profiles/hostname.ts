import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeServerUrlError extends Error {}

/**
 * Returns true if the given IP literal is loopback, private, link-local, or
 * otherwise not a public address we should let a profile point at (SSRF guard).
 */
export function isBlockedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIpv4(ip);
  if (type === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP — refuse
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — extract and check as v4
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  return false;
}

/**
 * Validate a profile's Actual server URL. Always requires https. When
 * `blockPrivate` is true (opt-in SSRF guard), also rejects hosts that are — or
 * resolve to — loopback/private/link-local addresses. The guard is off by
 * default because a self-hosted Actual server is normally on the same LAN.
 * Throws UnsafeServerUrlError on any failure.
 */
export async function assertSafeServerUrl(
  raw: string,
  opts?: { blockPrivate?: boolean },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeServerUrlError("Server URL is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeServerUrlError("Server URL must use https.");
  }

  if (!opts?.blockPrivate) return url;

  const host = url.hostname;

  // If the host is itself an IP literal, check it directly.
  if (net.isIP(host) !== 0) {
    if (isBlockedIp(host)) {
      throw new UnsafeServerUrlError("Server URL host is a private or loopback address.");
    }
    return url;
  }

  // Otherwise resolve and reject if any resolved address is blocked.
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new UnsafeServerUrlError(`Could not resolve host '${host}'.`);
  }
  if (addrs.length === 0) {
    throw new UnsafeServerUrlError(`Host '${host}' did not resolve.`);
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new UnsafeServerUrlError(
        `Server URL host '${host}' resolves to a private or loopback address.`,
      );
    }
  }
  return url;
}
