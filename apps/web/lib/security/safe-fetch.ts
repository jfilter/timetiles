/**
 * SSRF-safe fetch wrapper that validates redirect targets and performs
 * resolved-IP checks to prevent DNS rebinding attacks.
 *
 * In production (and whenever DNS checking is enabled), the resolved IP is
 * pinned into the undici dispatcher so the actual TCP connect uses the
 * already-validated address — closing the DNS-rebinding TOCTOU window
 * between the validation `dns.lookup()` and undici's own connect-time
 * lookup.
 *
 * @module
 * @category Security
 */
import type { LookupFunction } from "node:net";

import { Agent } from "undici";

import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { isE2E } from "@/lib/utils/is-e2e";

import { isPrivateUrl, resolvePublicHostname } from "./url-validation";

/** Maximum number of redirects to follow. */
const DEFAULT_MAX_REDIRECTS = 5;

/** HTTP status codes that indicate a redirect. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Whether DNS resolution checks are enabled (prevents DNS rebinding). */
const isDnsCheckEnabled = (override?: boolean): boolean => {
  const env = getEnv();

  // Production always enforces resolved-IP validation. E2E runs under
  // `next start`, so it keeps the explicit runtime bypass for local fixtures.
  if (env.NODE_ENV === "production" && !isE2E()) {
    return true;
  }

  return override ?? env.SSRF_DNS_CHECK;
};

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Maximum number of redirects to follow (default: 5). */
  maxRedirects?: number;
  /** Override DNS check setting for this request. */
  dnsCheck?: boolean;
}

/**
 * Build an undici dispatcher that returns a fixed IP from its `lookup` hook.
 *
 * The TLS/SNI handshake still uses the original hostname (passed by the
 * fetch client on the URL), so HTTPS certificate validation is unaffected.
 * Only the underlying TCP connect target is pinned.
 */
const buildPinnedDispatcher = (resolved: Array<{ address: string; family: 4 | 6 }>): Agent => {
  // Prefer IPv4 if available; undici's connect expects a single address.
  const preferred = resolved.find((r) => r.family === 4) ?? resolved[0]!;

  const pinnedLookup: LookupFunction = (_host, _opts, cb) => {
    cb(null, preferred.address, preferred.family);
  };

  return new Agent({ connect: { lookup: pinnedLookup } });
};

/**
 * SSRF-safe fetch that prevents redirect-based and DNS-rebinding attacks.
 *
 * - Validates the initial URL with `isPrivateUrl()` before fetching
 * - Sets `redirect: 'manual'` and validates each redirect target
 * - Resolves DNS and checks every returned IP in production
 * - Pins the resolved IP into the undici dispatcher so connect-time DNS
 *   cannot return a different (possibly private) IP
 * - Allows explicit DNS checking in development/test with `SSRF_DNS_CHECK=true`
 *
 * Returns the final `Response` object, compatible with native `fetch()`.
 */
/** Validate a URL against SSRF guards and return the parsed URL + pinned dispatcher. */
const prepareHop = async (
  currentUrl: string,
  dnsCheck: boolean
): Promise<{ parsed: URL; pinnedDispatcher: Agent | undefined }> => {
  const parsed = new URL(currentUrl); // throws TypeError for malformed URLs
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`SSRF blocked: unsupported protocol ${parsed.protocol}`);
  }
  if (isPrivateUrl(currentUrl)) {
    throw new Error(`SSRF blocked: URL targets a private/internal address: ${currentUrl}`);
  }

  let pinnedDispatcher: Agent | undefined;
  if (dnsCheck) {
    const resolved = await resolvePublicHostname(parsed.hostname);
    if (resolved && resolved.length > 0) {
      pinnedDispatcher = buildPinnedDispatcher(resolved);
    }
  }
  return { parsed, pinnedDispatcher };
};

/** Swallow agent close errors — we always prefer to return the fetch result. */
const closeSilently = async (agent: Agent): Promise<void> => {
  try {
    await agent.close();
  } catch {
    // intentional no-op
  }
};

/** Perform a single fetch with the (optionally pinned) dispatcher. */
const fetchWithDispatcher = async (
  url: string,
  fetchOptions: Omit<SafeFetchOptions, "maxRedirects" | "dnsCheck">,
  dispatcher: Agent | undefined
): Promise<Response> => {
  const fetchInit = { ...fetchOptions, redirect: "manual" as const };
  const withDispatcher = dispatcher ? ({ ...fetchInit, dispatcher } as RequestInit & { dispatcher: Agent }) : fetchInit;
  return fetch(url, withDispatcher as RequestInit);
};

/** Determine the next redirect target URL, or null when no further redirect. */
const nextRedirectUrl = (response: Response, currentUrl: string): string | null => {
  if (!REDIRECT_STATUSES.has(response.status)) return null;
  const location = response.headers.get("location");
  if (!location) return null;
  return new URL(location, currentUrl).toString();
};

export const safeFetch = async (url: string, options?: SafeFetchOptions): Promise<Response> => {
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsCheck = isDnsCheckEnabled(options?.dnsCheck);
  const { maxRedirects: _maxRedirects, dnsCheck: _dnsCheck, ...fetchOptions } = options ?? {};

  let currentUrl = url;
  const visited = new Set<string>();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const { pinnedDispatcher } = await prepareHop(currentUrl, dnsCheck);

    if (visited.has(currentUrl)) {
      if (pinnedDispatcher) await pinnedDispatcher.close();
      throw new Error(`SSRF blocked: redirect loop detected at ${currentUrl}`);
    }
    visited.add(currentUrl);

    let response: Response;
    try {
      response = await fetchWithDispatcher(currentUrl, fetchOptions, pinnedDispatcher);
    } finally {
      // Close the per-request agent to avoid accumulating connection pools.
      // Fire-and-forget: a close failure must not mask the fetch result.
      if (pinnedDispatcher) void closeSilently(pinnedDispatcher);
    }

    const nextUrl = nextRedirectUrl(response, currentUrl);
    if (nextUrl === null) return response;

    logger.debug("Following redirect with SSRF validation", {
      from: currentUrl,
      to: nextUrl,
      status: response.status,
      redirect: redirectCount + 1,
    });
    currentUrl = nextUrl;
  }

  throw new Error(`SSRF blocked: too many redirects (max ${maxRedirects})`);
};
