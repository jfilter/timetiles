/**
 * Field key validation for event filter field paths.
 *
 * Defense-in-depth validation applied at filter construction time,
 * ensuring all downstream consumers receive sanitized field keys.
 *
 * @module
 * @category Filters
 */

/** Maximum allowed depth for dot-separated field paths */
export const MAX_FIELD_PATH_DEPTH = 5;

/** Maximum allowed length for a field key string */
export const MAX_FIELD_KEY_LENGTH = 64;

/** Pattern for valid field key segments (alphanumeric, underscores, hyphens) */
// Input bounded to MAX_FIELD_KEY_LENGTH chars, so this pattern is safe from ReDoS
// eslint-disable-next-line security/detect-unsafe-regex
export const VALID_FIELD_KEY_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;

/**
 * Validate a field key for use in SQL or Payload queries.
 *
 * @returns true if the key is safe to use in queries
 */
export const isValidFieldKey = (fieldKey: string): boolean => {
  if (fieldKey.length > MAX_FIELD_KEY_LENGTH) return false;
  if (!VALID_FIELD_KEY_PATTERN.test(fieldKey)) return false;
  if (fieldKey.split(".").length > MAX_FIELD_PATH_DEPTH) return false;
  return true;
};

/**
 * Filter a field filters object, removing entries with invalid keys.
 *
 * @returns A new object containing only entries with valid field keys
 */
export const sanitizeFieldFilters = (fieldFilters: Record<string, string[]>): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(fieldFilters)) {
    if (isValidFieldKey(key) && Array.isArray(values) && values.length > 0) {
      result[key] = values;
    }
  }
  return result;
};
