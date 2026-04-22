/**
 * URL validation utilities to prevent SSRF attacks.
 *
 * Provides hostname-level checks against private/internal IP ranges and
 * resolved-host checks for runtime outbound requests.
 *
 * @module
 * @category Utils
 */
import dns from "node:dns";

import { logger } from "@/lib/logger";
import { isE2E } from "@/lib/utils/is-e2e";

/** IPv4 private range patterns (hostname-level, no DNS resolution). */
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^0\./, // "This" network
  /^169\.254\./, // Link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (RFC 6598)
];

/** Hostnames that resolve to private/loopback addresses. */
const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

/** Hostname suffixes that indicate private/internal networks. */
const PRIVATE_HOSTNAME_SUFFIXES = [".local"];

/** IPv6 loopback and private patterns. */
const PRIVATE_IPV6_PATTERNS = [
  /^::1$/, // Loopback
  /^::$/, // Unspecified
  /^fe80:/i, // Link-local
  /^fc00:/i, // Unique local (ULA)
  /^fd/i, // Unique local (ULA)
  /^\[::1\]$/, // Bracketed loopback
  /^\[::?\]$/, // Bracketed unspecified
  /^\[fe80:/i, // Bracketed link-local
  /^\[fc00:/i, // Bracketed ULA
  /^\[fd/i, // Bracketed ULA
];

/**
 * Check whether a raw IP address is in a private/internal range.
 *
 * Operates on resolved IP strings (e.g., from `dns.promises.lookup()`),
 * not on URLs or hostnames. Used by `safeFetch()` for DNS rebinding protection.
 *
 * @param ip - A raw IPv4 or IPv6 address string.
 * @returns `true` if the IP is private/internal.
 */
export const isPrivateIP = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  const ipv6MappedIpv4 = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : null;

  if (ipv6MappedIpv4) {
    return isPrivateIP(ipv6MappedIpv4);
  }

  if (normalized === "0.0.0.0") return true;

  for (const pattern of PRIVATE_IPV4_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  for (const pattern of PRIVATE_IPV6_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  return false;
};

/**
 * Check whether a URL's hostname points to a private/internal IP range.
 *
 * This performs hostname pattern matching only (no DNS resolution) to guard
 * against SSRF attacks. It catches the most common private ranges:
 * 10.x, 172.16-31.x, 192.168.x, 127.x, 0.0.0.0, ::1, localhost, etc.
 *
 * @param url - The URL string to check.
 * @returns `true` if the URL targets a private/internal address.
 */
// Extracted to prevent Next.js build-time dead-code elimination.
// Uses bracket notation so webpack DefinePlugin doesn't inline the value.
// The bypass is intentionally limited to explicit non-production runtimes. E2E
// runs a production build under `next start`, so it needs a dedicated runtime
// flag instead of relying on NODE_ENV alone.
const isPrivateUrlBypassEnabled = (): boolean => {
  if (process.env["ALLOW_PRIVATE_URLS"] !== "true") {
    return false;
  }

  if (isE2E()) {
    return true;
  }

  const runtimeNodeEnv = process.env["NODE_ENV"];
  return runtimeNodeEnv === "development" || runtimeNodeEnv === "test";
};

/** True when a URL carries embedded username/password credentials. */
export const hasUrlEmbeddedCredentials = (url: URL): boolean => url.username !== "" || url.password !== "";

export const isPrivateUrl = (url: string): boolean => {
  // Allow private URLs when explicitly opted in (e.g., E2E tests with local test servers)
  if (isPrivateUrlBypassEnabled()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Fail-closed: unparseable URLs are treated as private (blocked)
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check well-known private hostnames
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    return true;
  }

  // Check private hostname suffixes (e.g., *.local)
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }

  // Check for 0.0.0.0 exactly
  if (hostname === "0.0.0.0") {
    return true;
  }

  // IPv4 patterns
  for (const pattern of PRIVATE_IPV4_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // IPv6 patterns (may or may not be in brackets depending on URL parsing)
  for (const pattern of PRIVATE_IPV6_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  return false;
};

/**
 * Validates that a string is a valid external HTTP(S) URL.
 *
 * Rejects non-HTTP protocols and private/internal addresses (SSRF protection).
 * Returns the parsed URL on success or an error message on failure.
 */
export const validateExternalHttpUrl = (urlString: string): { url: URL } | { error: string } => {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
    }
    if (isPrivateUrl(urlString)) {
      return { error: "URLs pointing to private or internal networks are not allowed." };
    }
    return { url };
  } catch {
    return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
  }
};

/**
 * Resolve a hostname and validate that every returned address is public.
 *
 * Returns the resolved addresses on success so callers can pin the fetch to
 * the already-validated IP — this closes the DNS-rebinding TOCTOU window
 * between the validation lookup and the actual connect-time lookup undici
 * would otherwise perform. Returns `null` when the DNS lookup itself fails
 * (non-blocking — the caller's fetch will surface the transport error).
 */
export const resolvePublicHostname = async (
  hostname: string
): Promise<Array<{ address: string; family: 4 | 6 }> | null> => {
  if (isPrivateUrlBypassEnabled()) {
    return null;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    const raw = (await dns.promises.lookup(hostname, { all: true, verbatim: true })) as
      | Array<{ address: string; family: number }>
      | { address: string; family: number };
    resolved = Array.isArray(raw) ? raw : [raw];
  } catch (error) {
    logger.debug("DNS lookup failed during SSRF check (non-blocking)", { hostname, error });
    return null;
  }

  for (const entry of resolved) {
    if (isPrivateIP(entry.address)) {
      throw new Error(`SSRF blocked: hostname "${hostname}" resolves to private IP ${entry.address}`);
    }
  }

  return resolved.map((e) => ({ address: e.address, family: e.family === 6 ? 6 : 4 }));
};

/**
 * Validates that a hostname resolves only to public IP addresses.
 *
 * DNS lookup failures remain non-blocking so transport-level errors still
 * surface through the caller's normal fetch/clone path. Kept for callers
 * that only need the validation side-effect; prefer {@link resolvePublicHostname}
 * when you also want to pin the resolved IP to defeat DNS-rebinding TOCTOU.
 */
export const validateResolvedPublicHostname = async (hostname: string): Promise<void> => {
  await resolvePublicHostname(hostname);
};
