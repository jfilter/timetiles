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

import { isPrivateIP, normalizeAddressLiteral } from "@timetiles/shared";

import { isE2E } from "@/lib/utils/is-e2e";

/** Hostnames that resolve to private/loopback addresses. */
const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

/** Hostname suffixes that indicate private/internal networks. */
const PRIVATE_HOSTNAME_SUFFIXES = [".local"];

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

  // Normalize before matching: the parser keeps brackets around an IPv6
  // literal and rewrites an embedded IPv4 address into hex, neither of which
  // the range patterns below recognise. A DNS name is unaffected.
  const hostname = normalizeAddressLiteral(parsed.hostname);

  // Check well-known private hostnames
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    return true;
  }

  // Check private hostname suffixes (e.g., *.local)
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }

  // IP-literal classification is owned by the shared package — one implementation
  // for URL-level checks here and resolved-IP checks in safe-fetch/timescrape.
  return isPrivateIP(hostname);
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
 * would otherwise perform. Throws when the DNS lookup fails; returns `null`
 * only when the private-URL bypass is enabled.
 */
export const resolvePublicHostname = async (
  hostname: string
): Promise<Array<{ address: string; family: 4 | 6 }> | null> => {
  if (isPrivateUrlBypassEnabled()) {
    return null;
  }

  // A URL hostname keeps the brackets around an IPv6 literal, and
  // `dns.lookup("[::1]")` always fails with ENOTFOUND; without brackets `lookup`
  // echoes the literal back, which `isPrivateIP` can then classify.
  const lookupHost = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  let resolved: Array<{ address: string; family: number }>;
  try {
    const raw = (await dns.promises.lookup(lookupHost, { all: true, verbatim: true })) as
      | Array<{ address: string; family: number }>
      | { address: string; family: number };
    resolved = Array.isArray(raw) ? raw : [raw];
  } catch (error) {
    // Without resolved addresses neither the private-IP check nor IP pinning can apply.
    throw new Error(`DNS lookup failed for "${hostname}": ${error instanceof Error ? error.message : String(error)}`);
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
 * Throws when the lookup fails or any address is private. Kept for callers
 * that only need the validation side-effect; prefer {@link resolvePublicHostname}
 * when you also want to pin the resolved IP to defeat DNS-rebinding TOCTOU.
 */
export const validateResolvedPublicHostname = async (hostname: string): Promise<void> => {
  await resolvePublicHostname(hostname);
};
