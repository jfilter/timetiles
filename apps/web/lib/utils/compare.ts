/**
 * Deterministic string comparators.
 *
 * @module
 * @category Utilities
 */

/**
 * Compare two strings by UTF-16 code unit, ascending.
 *
 * Unlike `String.prototype.localeCompare`, the ordering is byte-for-byte
 * reproducible across machines and runtimes — it does not depend on the
 * locale or the ICU version. Use it wherever sort order must be stable, e.g.
 * dedup keys, cache keys, or canonical JSON serialization.
 */
export const compareCodeUnits = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
