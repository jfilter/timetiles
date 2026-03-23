/**
 * SSRF-safe fetch wrapper that validates redirect targets and optionally
 * performs DNS resolution checks to prevent DNS rebinding attacks.
 *
 * @module
 * @category Security
 */
import dns from "node:dns";

import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import { isPrivateIP, isPrivateUrl } from "./url-validation";

/** Maximum number of redirects to follow. */
const DEFAULT_MAX_REDIRECTS = 5;

/** HTTP status codes that indicate a redirect. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Whether DNS resolution checks are enabled (prevents DNS rebinding). */
const isDnsCheckEnabled = (): boolean => getEnv().SSRF_DNS_CHECK;

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Maximum number of redirects to follow (default: 5). */
  maxRedirects?: number;
  /** Override DNS check setting for this request. */
  dnsCheck?: boolean;
}

/**
 * Resolve a hostname and check that the resolved IP is not private.
 *
 * @throws {Error} If the hostname resolves to a private/internal IP.
 */
const validateDnsResolution = async (hostname: string): Promise<void> => {
  try {
    const { address } = await dns.promises.lookup(hostname);
    if (isPrivateIP(address)) {
      throw new Error(`SSRF blocked: hostname "${hostname}" resolves to private IP ${address}`);
    }
  } catch (error) {
    // Re-throw our own SSRF errors
    if (error instanceof Error && error.message.startsWith("SSRF blocked")) {
      throw error;
    }
    // DNS lookup failures are not SSRF — let fetch handle them
    logger.debug("DNS lookup failed during SSRF check (non-blocking)", { hostname, error });
  }
};

/**
 * SSRF-safe fetch that prevents redirect-based and DNS-rebinding attacks.
 *
 * - Validates the initial URL with `isPrivateUrl()` before fetching
 * - Sets `redirect: 'manual'` and validates each redirect target
 * - Optionally resolves DNS and checks the resolved IP (enable with `SSRF_DNS_CHECK=true`)
 *
 * Returns the final `Response` object, compatible with native `fetch()`.
 */
export const safeFetch = async (url: string, options?: SafeFetchOptions): Promise<Response> => {
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsCheck = options?.dnsCheck ?? isDnsCheckEnabled();
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

    // Optional DNS resolution check to prevent DNS rebinding
    if (dnsCheck) {
      const hostname = new URL(currentUrl).hostname;
      await validateDnsResolution(hostname);
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
