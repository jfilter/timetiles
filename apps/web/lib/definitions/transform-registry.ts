/**
 * Canonical registry for transform type definitions.
 *
 * This is the single source of truth for:
 * - Transform type slugs and metadata (labels, descriptions)
 * - String operation slugs
 * - Date format options
 *
 * All other modules (types, CMS fields, UI components) derive from here
 * instead of maintaining their own copies.
 *
 * @module
 * @category Definitions
 */

// ---------------------------------------------------------------------------
// Transform types
// ---------------------------------------------------------------------------

export const TRANSFORM_TYPES = [
  "rename",
  "date-parse",
  "string-op",
  "concatenate",
  "split",
  "parse-json-array",
  "split-to-array",
  "extract",
] as const;

export type TransformType = (typeof TRANSFORM_TYPES)[number];

/**
 * Metadata for each transform type: label and description.
 *
 * Used by UI components for display and by CMS field definitions
 * for select option generation.
 */
export const TRANSFORM_DEFINITIONS = {
  rename: { label: "Rename Field", description: "Change the name of a field" },
  "date-parse": { label: "Parse Date", description: "Parse date strings into a standardized format" },
  "string-op": {
    label: "String Operation",
    description: "Apply string operations like uppercase, lowercase, trim, replace, or expression",
  },
  concatenate: { label: "Concatenate Fields", description: "Join multiple fields together with a separator" },
  split: { label: "Split Field", description: "Split a field into multiple fields using a delimiter" },
  "parse-json-array": {
    label: "Parse JSON Array",
    description: "Parse a JSON-stringified array into a native array for tag/multi-value fields",
  },
  "split-to-array": {
    label: "Split to Array",
    description: "Split a delimited string into an array for tag/multi-value fields",
  },
  extract: {
    label: "Extract (Regex)",
    description: "Extract a substring from a field using a regex pattern into a new field",
  },
} as const satisfies Record<TransformType, { label: string; description: string }>;

// ---------------------------------------------------------------------------
// String operations
// ---------------------------------------------------------------------------

export const STRING_OPERATIONS = ["uppercase", "lowercase", "trim", "replace", "expression"] as const;

export type StringOperation = (typeof STRING_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// Date format options
// ---------------------------------------------------------------------------

export const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2024)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2024)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2024-12-31)" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY (31-12-2024)" },
  { value: "MM-DD-YYYY", label: "MM-DD-YYYY (12-31-2024)" },
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY (31.12.2024)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2024/12/31)" },
  { value: "D MMMM YYYY", label: "D MMMM YYYY (31 December 2024)" },
  { value: "MMMM D, YYYY", label: "MMMM D, YYYY (December 31, 2024)" },
] as const;

/** Output format options include ISO 8601 full datetime in addition to the date-only formats. */
export const DATE_OUTPUT_FORMAT_OPTIONS = [
  { value: "ISO 8601", label: "ISO 8601 (2024-12-31T00:00:00.000Z)" },
  ...DATE_FORMAT_OPTIONS,
] as const;

/**
 * A suggested transform detected by comparing schema versions.
 *
 * When schema changes are detected (e.g., field removed + field added),
 * the system analyzes whether this represents a rename and suggests
 * a transform rule if confidence is high enough.
 */
export interface TransformSuggestion {
  /** Type of transformation being suggested */
  type: TransformType;

  /**
   * Source field path (what's in the new import file).
   *
   * This is the field name that appears in the incoming data
   * that doesn't match the existing schema.
   */
  from: string;

  /**
   * Target field path (what's in the existing schema).
   *
   * This is the canonical field name in the dataset schema
   * that the incoming field should be mapped to.
   */
  to: string;

  /**
   * Confidence score (0-100) based on multiple factors:
   * - Name similarity (Levenshtein distance)
   * - Type compatibility
   * - Common rename patterns
   * - Position proximity in schema
   *
   * Threshold: >= 70 for suggestion, >= 80 for high confidence
   */
  confidence: number;

  /**
   * Human-readable explanation of why this transform was suggested.
   *
   * Examples:
   * - "Similar names (87%), Compatible types, Matches common rename pattern"
   * - "Similar names (95%), Compatible types"
   */
  reason: string;
}
