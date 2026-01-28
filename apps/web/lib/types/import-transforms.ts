/**
 * Types for import transform rules that handle field mapping during data import.
 *
 * Import transforms enable schema evolution by allowing datasets to map
 * incoming field names to their canonical schema field names, supporting
 * scenarios like column renames, case variations, and JSON path changes.
 *
 * @module
 * @category Types
 */

/**
 * Types of transformations that can be applied to import data.
 *
 * Supported types:
 * - rename: Map source field path to target field path
 * - date-parse: Parse date strings into standardized format
 * - string-op: Apply string operations (uppercase, lowercase, trim, replace)
 * - concatenate: Combine multiple fields into one
 * - split: Split one field into multiple fields
 * - type-cast: Convert field values from one type to another
 */
export type TransformType = "rename" | "date-parse" | "string-op" | "concatenate" | "split" | "type-cast";

/**
 * Data types supported for type casting
 */
export type CastableType = "string" | "number" | "boolean" | "date" | "array" | "object" | "null";

/**
 * Strategies for type casting
 */
export type CastStrategy = "parse" | "cast" | "custom" | "reject";

/**
 * Base properties shared by all transform rules.
 */
interface BaseTransform {
  /** Unique identifier for this transform rule */
  id: string;

  /** Whether this transform is currently active */
  active: boolean;

  /** Timestamp when this transform was created */
  addedAt?: Date;

  /** User ID who created this transform */
  addedBy?: string;

  /** Confidence score if auto-detected (0-100) */
  confidence?: number;

  /** Whether this transform was suggested by auto-detection */
  autoDetected: boolean;
}

/**
 * Rename transform - maps source field path to target field path.
 */
export interface RenameTransform extends BaseTransform {
  type: "rename";
  /** Source field path (e.g., "date", "user.email") */
  from: string;
  /** Target field path (e.g., "start_date") */
  to: string;
}

/**
 * Date parse transform - converts date strings to standardized format.
 */
export interface DateParseTransform extends BaseTransform {
  type: "date-parse";
  /** Source field containing date string */
  from: string;
  /** Expected input format (e.g., "DD/MM/YYYY", "MM-DD-YYYY") */
  inputFormat: string;
  /** Output format (typically "YYYY-MM-DD" for ISO 8601) */
  outputFormat: string;
  /** Optional timezone for parsing */
  timezone?: string;
}

/**
 * String operation transform - applies string manipulations.
 */
export interface StringOpTransform extends BaseTransform {
  type: "string-op";
  /** Source field to transform */
  from: string;
  /** Operation to apply */
  operation: "uppercase" | "lowercase" | "trim" | "replace";
  /** Pattern for replace operation */
  pattern?: string;
  /** Replacement string for replace operation */
  replacement?: string;
}

/**
 * Concatenate transform - joins multiple fields into one.
 */
export interface ConcatenateTransform extends BaseTransform {
  type: "concatenate";
  /** Source fields to concatenate */
  fromFields: string[];
  /** Separator between fields */
  separator: string;
  /** Target field name for the combined value */
  to: string;
}

/**
 * Split transform - splits one field into multiple fields.
 */
export interface SplitTransform extends BaseTransform {
  type: "split";
  /** Source field to split */
  from: string;
  /** Delimiter to split on */
  delimiter: string;
  /** Target field names for split values */
  toFields: string[];
}

/**
 * Type cast transform - converts field values from one type to another.
 *
 * Supports multiple strategies:
 * - parse: Intelligently parse value (e.g., "123" → 123, "true" → true)
 * - cast: Direct type coercion (e.g., String(value), Number(value))
 * - custom: User-defined JavaScript function
 * - reject: Throw error on type mismatch
 */
export interface TypeCastTransform extends BaseTransform {
  type: "type-cast";
  /** Field path to transform (e.g., "temperature" or "location.altitude") */
  from: string;
  /** Expected source type */
  fromType: CastableType;
  /** Target type to convert to */
  toType: CastableType;
  /** Strategy for performing the conversion */
  strategy: CastStrategy;
  /** Custom JavaScript function for 'custom' strategy: (value, context) => transformedValue */
  customFunction?: string;
}

/**
 * Union of all transform types.
 *
 * Applied before schema validation and event creation to normalize
 * incoming data structure to match the dataset's canonical schema.
 */
export type ImportTransform =
  | RenameTransform
  | DateParseTransform
  | StringOpTransform
  | ConcatenateTransform
  | SplitTransform
  | TypeCastTransform;

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

/**
 * Display labels for transform types
 */
export const TRANSFORM_TYPE_LABELS: Record<TransformType, string> = {
  rename: "Rename Field",
  "date-parse": "Parse Date",
  "string-op": "String Operation",
  concatenate: "Concatenate Fields",
  split: "Split Field",
  "type-cast": "Convert Type",
};

/**
 * Descriptions for transform types
 */
export const TRANSFORM_TYPE_DESCRIPTIONS: Record<TransformType, string> = {
  rename: "Change the name of a field",
  "date-parse": "Parse date strings into a standardized format",
  "string-op": "Apply string operations like uppercase, lowercase, or replace",
  concatenate: "Join multiple fields together with a separator",
  split: "Split a field into multiple fields using a delimiter",
  "type-cast": "Convert field values from one type to another (e.g., string to number)",
};

/**
 * Display labels for castable types
 */
export const CASTABLE_TYPE_LABELS: Record<CastableType, string> = {
  string: "Text",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  array: "Array",
  object: "Object",
  null: "Null",
};

/**
 * Display labels for cast strategies
 */
export const CAST_STRATEGY_LABELS: Record<CastStrategy, string> = {
  parse: "Parse (intelligent conversion)",
  cast: "Cast (direct coercion)",
  custom: "Custom Function",
  reject: "Reject (fail on mismatch)",
};

/**
 * Common date format options for date-parse transforms
 */
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

/**
 * Check if a transform has all required fields configured
 */
export const isTransformValid = (transform: ImportTransform): boolean => {
  switch (transform.type) {
    case "rename":
      return Boolean(transform.from && transform.to);
    case "date-parse":
      return Boolean(transform.from && transform.inputFormat && transform.outputFormat);
    case "string-op":
      return Boolean(transform.from && transform.operation);
    case "concatenate":
      // separator is always a string per the type definition, so we just validate the other required fields
      return Boolean(transform.fromFields.length >= 2 && transform.to);
    case "split":
      return Boolean(transform.from && transform.delimiter && transform.toFields.length >= 1);
    case "type-cast":
      return Boolean(
        transform.from &&
          transform.fromType &&
          transform.toType &&
          transform.strategy &&
          (transform.strategy !== "custom" || transform.customFunction)
      );
    default:
      return false;
  }
};

/**
 * Create a new transform with default values
 */
export const createTransform = (type: TransformType): ImportTransform => {
  const base = {
    id: crypto.randomUUID(),
    active: true,
    autoDetected: false,
  };

  switch (type) {
    case "rename":
      return { ...base, type: "rename", from: "", to: "" };
    case "date-parse":
      return { ...base, type: "date-parse", from: "", inputFormat: "", outputFormat: "YYYY-MM-DD" };
    case "string-op":
      return { ...base, type: "string-op", from: "", operation: "trim" };
    case "concatenate":
      return { ...base, type: "concatenate", fromFields: [], separator: " ", to: "" };
    case "split":
      return { ...base, type: "split", from: "", delimiter: ",", toFields: [] };
    case "type-cast":
      return { ...base, type: "type-cast", from: "", fromType: "string", toType: "number", strategy: "parse" };
  }
};
