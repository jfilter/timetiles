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

export const STRING_OPERATION_LABELS: Record<StringOperation, string> = {
  uppercase: "Uppercase",
  lowercase: "Lowercase",
  trim: "Trim Whitespace",
  replace: "Find & Replace",
  expression: "Custom Expression",
};

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

// ---------------------------------------------------------------------------
// Helpers for CMS / UI consumption
// ---------------------------------------------------------------------------

/** Generate Payload CMS select options from TRANSFORM_DEFINITIONS. */
export const getTransformTypeOptions = () =>
  TRANSFORM_TYPES.map((type) => ({ label: TRANSFORM_DEFINITIONS[type].label, value: type }));

/** Generate Payload CMS select options for string operations. */
export const getStringOperationOptions = () =>
  STRING_OPERATIONS.map((op) => ({ label: STRING_OPERATION_LABELS[op], value: op }));

/** Generate Payload CMS select options for date input formats. */
export const getDateFormatInputOptions = () => DATE_FORMAT_OPTIONS.map(({ value, label }) => ({ label, value }));
