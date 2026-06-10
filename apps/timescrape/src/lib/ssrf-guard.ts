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
  /^fc00:/i, // Unique local (ULA)
  /^fd/i, // Unique local (ULA)
];

/**
 * Check whether a raw resolved IP address is in a private/internal range.
 */
export const isPrivateIP = (ip: string): boolean => {
  const normalized = ip.toLowerCase();

  // Unwrap IPv4-mapped IPv6 addresses (e.g. ::ffff:10.0.0.1) and re-check.
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIP(normalized.slice("::ffff:".length));
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
