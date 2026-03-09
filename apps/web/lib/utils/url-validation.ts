/**
 * URL validation utilities to prevent SSRF attacks.
 *
 * Provides hostname-level checks against private/internal IP ranges
 * without performing DNS resolution.
 *
 * @module
 * @category Utils
 */

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
 * Check whether a URL's hostname points to a private/internal IP range.
 *
 * This performs hostname pattern matching only (no DNS resolution) to guard
 * against SSRF attacks. It catches the most common private ranges:
 * 10.x, 172.16-31.x, 192.168.x, 127.x, 0.0.0.0, ::1, localhost, etc.
 *
 * @param url - The URL string to check.
 * @returns `true` if the URL targets a private/internal address.
 */
export const isPrivateUrl = (url: string): boolean => {
  // Allow private URLs when explicitly opted in (e.g., integration tests with local test servers)
  if (process.env.ALLOW_PRIVATE_URLS === "true") {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unparseable URLs are not private, but callers should validate separately
    return false;
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
