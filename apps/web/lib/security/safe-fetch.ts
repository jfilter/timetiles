/**
 * SSRF-safe fetch wrapper that validates redirect targets and performs
 * resolved-IP checks to prevent DNS rebinding attacks.
 *
 * @module
 * @category Security
 */
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { isE2E } from "@/lib/utils/is-e2e";

import { isPrivateUrl, validateResolvedPublicHostname } from "./url-validation";

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
 * SSRF-safe fetch that prevents redirect-based and DNS-rebinding attacks.
 *
 * - Validates the initial URL with `isPrivateUrl()` before fetching
 * - Sets `redirect: 'manual'` and validates each redirect target
 * - Resolves DNS and checks every returned IP in production
 * - Allows explicit DNS checking in development/test with `SSRF_DNS_CHECK=true`
 *
 * Returns the final `Response` object, compatible with native `fetch()`.
 */
export const safeFetch = async (url: string, options?: SafeFetchOptions): Promise<Response> => {
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsCheck = isDnsCheckEnabled(options?.dnsCheck);
  const { maxRedirects: _maxRedirects, dnsCheck: _dnsCheck, ...fetchOptions } = options ?? {};

  let currentUrl = url;
  const visited = new Set<string>();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    // Validate URL scheme and structure
    const parsed = new URL(currentUrl); // throws TypeError for malformed URLs
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`SSRF blocked: unsupported protocol ${parsed.protocol}`);
    }

    // Validate URL is not targeting a private address
    if (isPrivateUrl(currentUrl)) {
      throw new Error(`SSRF blocked: URL targets a private/internal address: ${currentUrl}`);
    }

    // Resolved-IP validation blocks DNS rebinding and private redirect targets
    if (dnsCheck) {
      await validateResolvedPublicHostname(parsed.hostname);
    }

    // Detect redirect loops
    if (visited.has(currentUrl)) {
      throw new Error(`SSRF blocked: redirect loop detected at ${currentUrl}`);
    }
    visited.add(currentUrl);

    // Fetch with manual redirect handling
    const response = await fetch(currentUrl, { ...fetchOptions, redirect: "manual" });

    // If not a redirect, return the response
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    // Extract and validate redirect target
    const location = response.headers.get("location");
    if (!location) {
      // Redirect without Location header — return as-is
      return response;
    }

    // Resolve relative redirects against current URL
    const nextUrl = new URL(location, currentUrl).toString();

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
