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

/**
 * `JSON.stringify` that emits object keys in {@link compareCodeUnits} order, so the
 * output only depends on the data — not on insertion order, locale, or ICU version.
 * Use for dedup keys, cache keys, and content hashes.
 */
export const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key: string, entry: unknown): unknown => {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => compareCodeUnits(a, b))
      );
    }
    return entry;
  });
