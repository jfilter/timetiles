/**
 * HTML escaping for strings interpolated into chart tooltips.
 *
 * ECharts' default `renderMode` is `"html"`, so whatever a `tooltip.formatter`
 * returns is assigned via `innerHTML`. Tooltips interpolate values that come
 * from imported data (event titles, group names), which makes any unescaped
 * interpolation a stored-XSS sink.
 *
 * @module
 */

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escape the five HTML-significant characters in a value bound for `innerHTML`.
 *
 * Deliberately takes only a string: accepting `unknown` would silently stringify an
 * object to "[object Object]" rather than failing at the call site.
 */
export const escapeHtml = (value: string | null | undefined): string =>
  (value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
