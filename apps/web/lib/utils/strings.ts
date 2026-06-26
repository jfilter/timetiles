/**
 * Small shared string helpers.
 *
 * @module
 * @category Utils
 */

/**
 * Return `value` unless it is nullish or an empty string, in which case `fallback`.
 *
 * Mirrors `value || fallback` for strings — only `""`, `null`, and `undefined`
 * fall back; a non-empty string such as `" "` is kept — but without the `||`
 * defaulting that `@typescript-eslint/prefer-nullish-coalescing` rejects, and
 * which `??` cannot express (it keeps `""`). Use for fields that legitimately
 * persist `""` (cleared admin inputs, blank manifest entries) where an empty
 * string is invalid downstream and the default must apply.
 */
export const defaultIfEmpty = (value: string | null | undefined, fallback: string): string =>
  value != null && value !== "" ? value : fallback;
