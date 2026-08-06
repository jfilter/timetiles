/**
 * SSRF guard for git clone targets.
 *
 * The web side validates a repo URL by hostname pattern only. By the time the
 * runner clones, a malicious DNS record could have been rebound to point an
 * otherwise-public hostname at an internal address (the DNS-rebinding window).
 * Before cloning we re-resolve the host and reject any answer that lands in a
 * private/loopback/link-local/carrier-grade-NAT/metadata range. This is
 * defence-in-depth on top of the trust-level-3 gate and the container network
 * isolation; the clone itself runs over the host network, so the check matters.
 *
 * Mirrors the IP-range logic in apps/web/lib/security/url-validation.ts. The two
 * apps do not share code, so the patterns are duplicated intentionally.
 *
 * @module
 * @category Lib
 */

import dns from "node:dns";

import { RunnerError } from "./errors.js";

/** IPv4 private/internal range patterns (operate on resolved IP strings). */
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^0\./, // "This" network
  /^169\.254\./, // Link-local (incl. cloud metadata 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (RFC 6598)
];

/** IPv6 loopback / private patterns. */
const PRIVATE_IPV6_PATTERNS = [
  /^::1$/, // Loopback
  /^::$/, // Unspecified
  /^fe80:/i, // Link-local
  /^f[cd][0-9a-f]{0,2}:/i, // Unique local (ULA, full fc00::/7)
];

/**
 * IPv6 prefixes that deliver traffic to an embedded IPv4 address: the
 * IPv4-mapped (`::ffff:`), deprecated IPv4-compatible (`::`), and NAT64
 * (`64:ff9b::`) prefixes. Longest first so `::ffff:` beats the bare `::`.
 */
const IPV4_EMBEDDED_PREFIXES = ["64:ff9b::", "::ffff:", "::"];

/** A dotted quad, as the mapped form is usually written. */
const DOTTED_QUAD = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Two hextets, as parsers canonicalize an embedded IPv4 (`::ffff:a9fe:a9fe`). */
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
 * Check whether a raw resolved IP address is in a private/internal range.
 */
export const isPrivateIP = (ip: string): boolean => {
  const lowered = ip.toLowerCase();
  // Unwrap any embedded IPv4 (mapped/compatible/NAT64, dotted or hex form) so
  // the IPv4 range checks apply to the address the traffic actually reaches.
  const normalized = embeddedIpv4(lowered) ?? lowered;

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
 * Resolve a git URL's host and reject it when any answer is a private/internal
 * address. Throws a {@link RunnerError} on a blocked target. DNS-lookup failures
 * are left to surface as the normal clone transport error, so an unresolvable
 * host is not blocked here (the clone will fail anyway).
 *
 * @param gitUrl - The clone URL (without the optional `#branch` fragment).
 * @throws {RunnerError} when the host resolves to a private/internal IP, or when
 *   the URL is not a parseable http(s) URL.
 */
export const assertGitTargetIsPublic = async (gitUrl: string): Promise<void> => {
  let parsed: URL;
  try {
    parsed = new URL(gitUrl);
  } catch {
    throw new RunnerError("Invalid code_url", "INVALID_REQUEST", 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RunnerError("Only HTTP(S) git URLs are allowed", "INVALID_REQUEST", 400);
  }

  const hostname = parsed.hostname;

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Non-blocking: let the clone surface the transport-level failure.
    return;
  }

  for (const entry of resolved) {
    if (isPrivateIP(entry.address)) {
      throw new RunnerError(
        `Refusing to clone: host "${hostname}" resolves to private address ${entry.address}`,
        "SSRF_BLOCKED",
        400
      );
    }
  }
};
