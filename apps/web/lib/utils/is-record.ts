/**
 * Type guard for plain-object records (non-null object, not an array).
 *
 * @module
 * @category Utils
 */

/** Narrow an unknown value to a string-keyed record. Arrays and null are rejected. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
