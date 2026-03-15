/**
 * Stable empty array reference to prevent unnecessary React re-renders.
 *
 * Use instead of inline `[]` in default values, fallback expressions, and
 * props where referential equality matters (e.g., `data ?? EMPTY_ARRAY`).
 * Typed as `never[]` so it's assignable to any `T[]`.
 * The array is frozen at runtime to prevent accidental mutation.
 *
 * @module
 * @category Constants
 */
export const EMPTY_ARRAY: never[] = Object.freeze([]) as never[];
