/**
 * Helpers for validating local redirect targets.
 *
 * Prevents open redirects by allowing only in-app absolute paths and
 * rejecting absolute URLs or protocol-relative paths.
 *
 * @module
 * @category Utils
 */

/**
 * Return whether a redirect target is a safe local path.
 *
 * Safe targets must:
 * - start with a single `/`
 * - not begin with `//` or `/\`, which browsers can interpret as a host
 */
export const isSafeLocalRedirectPath = (target: string): boolean =>
  target.length > 0 && target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\");

/**
 * Normalize a user-provided redirect target to a safe in-app path.
 *
 * Falls back to `/` for missing or unsafe values.
 */
export const getSafeLocalRedirectPath = (target: string | null | undefined, fallback = "/"): string =>
  typeof target === "string" && isSafeLocalRedirectPath(target) ? target : fallback;
