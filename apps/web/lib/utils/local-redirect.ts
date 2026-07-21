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
 * Placeholder origin for resolving candidate paths. `.invalid` is reserved by
 * RFC 2606 and can never be a real host, so a target that escapes to any other
 * origin is unambiguously not local.
 */
const PLACEHOLDER_ORIGIN = "https://timetiles.invalid";

/**
 * Characters a browser strips from a URL before parsing it (tab, LF, CR, and
 * the rest of the C0 range plus DEL).
 *
 * These are why prefix checks alone cannot decide this question: `/\t/evil.com`
 * begins with a single `/`, so it passes a `startsWith("//")` test, but the
 * browser removes the tab first and navigates to `//evil.com` — an off-site
 * redirect. A legitimate in-app path never contains one, so rejecting the whole
 * class is both safe and simpler than trying to model the stripping.
 */
const containsCharacterBrowsersStrip = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    // C0 controls (which include tab, LF and CR) plus DEL.
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
};

/**
 * Return whether a redirect target is a safe local path.
 *
 * Rather than enumerate the ways a target can escape, this resolves it against
 * a placeholder origin and requires the result to stay there. That reuses the
 * URL parser's own rules — including its treatment of backslashes as separators
 * — instead of restating them, so encodings nobody enumerated still fail closed.
 */
export const isSafeLocalRedirectPath = (target: string): boolean => {
  if (target.length === 0 || !target.startsWith("/")) return false;
  if (containsCharacterBrowsersStrip(target)) return false;

  try {
    return new URL(target, PLACEHOLDER_ORIGIN).origin === PLACEHOLDER_ORIGIN;
  } catch {
    return false;
  }
};

/**
 * Normalize a user-provided redirect target to a safe in-app path.
 *
 * Falls back to `/` for missing or unsafe values.
 */
export const getSafeLocalRedirectPath = (target: string | null | undefined, fallback = "/"): string =>
  typeof target === "string" && isSafeLocalRedirectPath(target) ? target : fallback;
