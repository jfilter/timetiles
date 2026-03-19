/**
 * URL sanitization utilities for safe logging.
 *
 * Strips query parameters (which may contain API keys, tokens, or other
 * secrets) before URLs are written to log output.
 *
 * @module
 * @category Utils
 */

/**
 * Remove query string and fragment from a URL for safe logging.
 *
 * Returns the scheme + host + path only. If the URL cannot be parsed,
 * returns a placeholder so callers never accidentally log the raw value.
 */
export const sanitizeUrlForLogging = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
};
