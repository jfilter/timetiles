/**
 * Private/internal IP classification for SSRF protection.
 *
 * Single source of truth for both apps: `apps/web` (safeFetch, URL validation)
 * and `apps/timescrape` (git clone guard). Operates on raw address strings —
 * resolved IPs from `dns.lookup()` or address literals from URL hostnames.
 * Hostname-level policy (localhost names, `.local` suffixes, env bypasses)
 * stays app-side.
 *
 * @module
 */

/** IPv4 private/internal range patterns (operate on dotted-quad strings). */
export const PRIVATE_IPV4_PATTERNS: readonly RegExp[] = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^0\./, // "This" network
  /^169\.254\./, // Link-local (incl. cloud metadata 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (RFC 6598)
];

/**
 * IPv6 loopback and private patterns.
 *
 * These are matched against hostnames too, so ULA patterns must require a `:`
 * (never present in DNS names): a bare `/^fd/` prefix blocked every public
 * domain starting with "fd" (fda.gov, fdic.gov, ...). The `f[cd]` form also
 * covers the full fc00::/7 ULA range, not just the literal fc00:/fd00: hextets.
 */
export const PRIVATE_IPV6_PATTERNS: readonly RegExp[] = [
  /^::1$/, // Loopback
  /^::$/, // Unspecified
  /^fe80:/i, // Link-local
  /^f[cd][0-9a-f]{0,2}:/i, // Unique local (ULA, fc00::/7)
  /^\[::1\]$/, // Bracketed loopback
  /^\[::?\]$/, // Bracketed unspecified
  /^\[fe80:/i, // Bracketed link-local
  /^\[f[cd][0-9a-f]{0,2}:/i, // Bracketed ULA (fc00::/7)
];

/**
 * IPv6 forms that carry an IPv4 address inside them.
 *
 * Both spellings have to be handled, because the value reaching us depends on
 * who wrote it. A human types the dotted form (`::ffff:169.254.169.254`), but
 * the WHATWG URL parser rewrites it: `new URL("http://[::ffff:169.254.169.254]/")`
 * yields the hostname `[::ffff:a9fe:a9fe]`. Matching only the dotted form
 * leaves the hex form unrecognised, so a mapped link-local or RFC1918 target
 * would pass every check and reach the cloud metadata service.
 *
 * `::ffff:` is the IPv4-mapped prefix, a bare `::` the deprecated
 * IPv4-compatible one, and `64:ff9b::` the well-known NAT64 prefix — all three
 * deliver traffic to the embedded IPv4 address, so all three must be unwrapped
 * before the IPv4 range checks can mean anything.
 *
 * Matched by prefix rather than by one combined pattern. Expressing all three
 * as a single regex needs nested optional groups (`::(?:ffff)?::?`) whose
 * alternatives overlap, which backtracks — `security/detect-unsafe-regex` flags
 * it, rightly. Longest first, so `::ffff:` is not swallowed by the bare `::`.
 */
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- these are the reserved IANA prefixes themselves, not addresses of any host
const IPV4_EMBEDDED_PREFIXES = ["64:ff9b::", "::ffff:", "::"];

/** A dotted quad, as a human writes the mapped form. */
const DOTTED_QUAD = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Two hextets, as the URL parser rewrites it. Each alternative is anchored and fixed-width. */
const HEXTET_PAIR = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/** Extract the IPv4 address an IPv6 literal carries, or null if it carries none. */
const embeddedIpv4 = (value: string): string | null => {
  const prefix = IPV4_EMBEDDED_PREFIXES.find((candidate) => value.startsWith(candidate));
  if (prefix == null) return null;

  // `::ffff:0:1.2.3.4` — the SIIT spelling puts a zero hextet before the address.
  let rest = value.slice(prefix.length);
  if (rest.startsWith("0:")) rest = rest.slice(2);

  if (DOTTED_QUAD.test(rest)) return rest;

  const hextets = HEXTET_PAIR.exec(rest);
  if (hextets?.[1] == null || hextets[2] == null) return null;

  const high = Number.parseInt(hextets[1], 16);
  const low = Number.parseInt(hextets[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
};

/**
 * Reduce an address literal to the form the range checks can match.
 *
 * Strips the brackets a URL hostname keeps around an IPv6 literal, and unwraps
 * any embedded IPv4 address to its dotted form. A DNS name passes through
 * untouched: names carry neither brackets nor `::`.
 */
export const normalizeAddressLiteral = (value: string): string => {
  let normalized = value.toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  return embeddedIpv4(normalized) ?? normalized;
};

/**
 * Check whether a raw IP address is in a private/internal range.
 *
 * Operates on resolved IP strings (e.g., from `dns.promises.lookup()`),
 * not on URLs or hostnames. Used for DNS rebinding protection.
 *
 * @param ip - A raw IPv4 or IPv6 address string.
 * @returns `true` if the IP is private/internal.
 */
export const isPrivateIP = (ip: string): boolean => {
  const normalized = normalizeAddressLiteral(ip);

  if (normalized === "0.0.0.0") return true;

  for (const pattern of PRIVATE_IPV4_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  for (const pattern of PRIVATE_IPV6_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  return false;
};
