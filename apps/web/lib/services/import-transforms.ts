/**
 * Applies import transform rules to incoming data.
 *
 * This service transforms raw import data (CSV rows, JSON objects, Excel rows)
 * according to dataset-level transform rules, enabling flexible field mapping
 * and schema evolution.
 *
 * Transforms are applied before schema detection and validation, ensuring
 * that incoming data is normalized to match the dataset's canonical schema
 * regardless of the source format.
 *
 * @module
 * @category Services
 */

import type {
  CastableType,
  ConcatenateTransform,
  DateParseTransform,
  ImportTransform,
  RenameTransform,
  SplitTransform,
  StringOpTransform,
  TypeCastTransform,
} from "@/lib/types/import-transforms";
import { isValidDate } from "@/lib/utils/date";

import { logger } from "../logger";

const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Apply transform rules to a data object.
 *
 * Transforms are applied in the order they appear in the transforms array.
 * Only active transforms are applied. The input data object is cloned
 * to avoid mutations.
 *
 * @param data - The data object to transform (CSV row, JSON object, etc.)
 * @param transforms - Array of transform rules to apply
 * @returns Transformed data object with field mappings applied
 *
 * @example
 * ```typescript
 * const data = { date: "2024-01-15", name: "Event" };
 * const transforms = [
 *   { type: "rename", from: "date", to: "start_date", active: true }
 * ];
 * const result = applyTransforms(data, transforms);
 * // Returns: { start_date: "2024-01-15", name: "Event" }
 * ```
 */
export const applyTransforms = (
  data: Record<string, unknown>,
  transforms: ImportTransform[]
): Record<string, unknown> => {
  // Clone to avoid mutating input
  const result = structuredClone(data);

  // Apply only active transforms
  const activeTransforms = transforms.filter((t) => t.active);

  for (const transform of activeTransforms) {
    switch (transform.type) {
      case "rename":
        applyRenameTransform(result, transform);
        break;
      case "date-parse":
        applyDateParseTransform(result, transform);
        break;
      case "string-op":
        applyStringOpTransform(result, transform);
        break;
      case "concatenate":
        applyConcatenateTransform(result, transform);
        break;
      case "split":
        applySplitTransform(result, transform);
        break;
      case "type-cast":
        applyTypeCastTransform(result, transform);
        break;
    }
  }

  return result;
};

/**
 * Apply a rename transform using path notation.
 *
 * Supports dot notation for nested paths (e.g., "user.email").
 * If the source field doesn't exist, the transform is skipped.
 * If the source field exists, it's moved to the target path and
 * removed from the source path.
 */
const applyRenameTransform = (data: Record<string, unknown>, transform: RenameTransform): void => {
  const value = getByPath(data, transform.from);

  // Only apply if source field exists
  if (value !== undefined) {
    setByPath(data, transform.to, value);
    deleteByPath(data, transform.from);
  }
};

/**
 * Parse a date string using the specified input format.
 *
 * Handles known date formats from DATE_FORMAT_OPTIONS by splitting
 * the string into components based on the format's separator and
 * component order. Falls back to `new Date()` for unrecognized formats.
 *
 * @returns Parsed Date, or null if parsing fails or the date is invalid.
 */
const parseFormatParts = (
  parts: string[],
  order: ("D" | "M" | "Y")[]
): { year: number; month: number; day: number } | null => {
  let year = 0,
    month = 0,
    day = 0;
  for (let i = 0; i < 3; i++) {
    const num = parseInt(parts[i]!, 10);
    if (isNaN(num)) return null;
    switch (order[i]) {
      case "Y":
        year = num;
        break;
      case "M":
        month = num;
        break;
      case "D":
        day = num;
        break;
    }
  }
  return { year, month, day };
};

const parseDateWithFormat = (value: string, inputFormat: string): Date | null => {
  const FORMAT_PATTERNS: Record<string, { order: ("D" | "M" | "Y")[]; separator: RegExp }> = {
    "DD/MM/YYYY": { order: ["D", "M", "Y"], separator: /\// },
    "MM/DD/YYYY": { order: ["M", "D", "Y"], separator: /\// },
    "YYYY-MM-DD": { order: ["Y", "M", "D"], separator: /-/ },
    "DD-MM-YYYY": { order: ["D", "M", "Y"], separator: /-/ },
    "MM-DD-YYYY": { order: ["M", "D", "Y"], separator: /-/ },
    "DD.MM.YYYY": { order: ["D", "M", "Y"], separator: /\./ },
    "YYYY/MM/DD": { order: ["Y", "M", "D"], separator: /\// },
  };
  const pattern = FORMAT_PATTERNS[inputFormat];
  if (pattern) {
    const parts = value.split(pattern.separator);
    if (parts.length === 3) {
      const parsed = parseFormatParts(parts, pattern.order);
      if (!parsed) return null;
      const { year, month, day } = parsed;
      if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
      }
      return date;
    }
  }
  const fallback = new Date(value);
  return isNaN(fallback.getTime()) ? null : fallback;
};

/**
 * Apply a date parse transform to convert date strings.
 *
 * Uses the transform's inputFormat to correctly interpret date strings,
 * handling ambiguous formats like DD/MM/YYYY vs MM/DD/YYYY.
 * Falls back to new Date() for unrecognized formats.
 */
/**
 * Adjust a UTC date to account for a source timezone.
 *
 * When the input date "2024-06-15" is parsed as UTC midnight but actually
 * represents midnight in "America/New_York", we need to shift it so that
 * the resulting UTC timestamp corresponds to the correct instant.
 */
const adjustForTimezone = (date: Date, timezone: string): Date => {
  // Format the UTC date in the target timezone to find the offset
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const tzLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = tzLocal - date.getTime();
  return new Date(date.getTime() - offsetMs);
};

const applyDateParseTransform = (data: Record<string, unknown>, transform: DateParseTransform): void => {
  const value = getByPath(data, transform.from);

  if (value === undefined || typeof value !== "string") return;

  try {
    const trimmedValue = value.trim();
    const parsed = parseDateWithFormat(trimmedValue, transform.inputFormat);
    if (parsed && !isNaN(parsed.getTime())) {
      // Apply timezone if configured
      const adjusted = transform.timezone ? adjustForTimezone(parsed, transform.timezone) : parsed;

      // Format output based on outputFormat
      let output: string;
      if (transform.outputFormat === "ISO 8601") {
        output = adjusted.toISOString();
      } else {
        // Default: date-only ISO format
        output = adjusted.toISOString().split("T")[0]!;
      }

      if (ISO_DATE_ONLY_REGEX.test(trimmedValue) && output !== trimmedValue && !transform.timezone) {
        return;
      }
      setByPath(data, transform.from, output);
    }
  } catch {
    // Keep original value if parsing fails
  }
};

/**
 * Apply a string operation transform.
 */
const applyStringOpTransform = (data: Record<string, unknown>, transform: StringOpTransform): void => {
  const value = getByPath(data, transform.from);

  if (value === undefined || typeof value !== "string") return;

  let result: string;
  switch (transform.operation) {
    case "uppercase":
      result = value.toUpperCase();
      break;
    case "lowercase":
      result = value.toLowerCase();
      break;
    case "trim":
      result = value.trim();
      break;
    case "replace":
      if (transform.pattern !== undefined) {
        result = value.replaceAll(transform.pattern, transform.replacement ?? "");
      } else {
        result = value;
      }
      break;
    default:
      result = value;
  }

  setByPath(data, transform.from, result);
};

/**
 * Apply a concatenate transform to join multiple fields.
 */
const applyConcatenateTransform = (data: Record<string, unknown>, transform: ConcatenateTransform): void => {
  const values: string[] = [];

  for (const field of transform.fromFields) {
    const value = getByPath(data, field);
    // Only stringify primitive types to avoid [object Object]
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values.push(String(value));
    }
  }

  if (values.length > 0) {
    setByPath(data, transform.to, values.join(transform.separator));
  }
};

/**
 * Apply a split transform to separate a field into multiple fields.
 */
const applySplitTransform = (data: Record<string, unknown>, transform: SplitTransform): void => {
  const value = getByPath(data, transform.from);

  if (value === undefined || typeof value !== "string") return;

  const parts = value.split(transform.delimiter);

  for (let i = 0; i < transform.toFields.length && i < parts.length; i++) {
    const targetField = transform.toFields[i];
    const part = parts[i];
    if (targetField && part !== undefined) {
      setByPath(data, targetField, part.trim());
    }
  }
};

/**
 * Apply a type-cast transform to convert values from one type to another.
 */
const applyTypeCastTransform = (data: Record<string, unknown>, transform: TypeCastTransform): void => {
  const value = getByPath(data, transform.from);

  // Skip null/undefined values
  if (value === undefined || value === null) return;

  // Check if value matches expected source type
  const actualType = getActualType(value);
  if (actualType !== transform.fromType) return;

  try {
    let newValue: unknown;

    switch (transform.strategy) {
      case "parse":
        newValue = parseValue(value, transform.toType);
        break;
      case "cast":
        newValue = castValue(value, transform.toType);
        break;
      case "custom":
        newValue = runCustomTransform(value, transform.customFunction ?? "");
        break;
      case "reject":
        throw new Error(`Type mismatch: expected ${transform.toType}, got ${actualType}`);
      default:
        return;
    }

    setByPath(data, transform.from, newValue);
  } catch (error) {
    // Log but don't throw - keep original value
    logger.warn({ error, transform }, "Type cast transform failed");
  }
};

/**
 * Get the actual type of a value for type casting.
 */
const getActualType = (value: unknown): CastableType => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean" || type === "object") {
    return type as CastableType;
  }
  return "string"; // Default fallback
};

const parseAsDate = (value: unknown): string => {
  const stringValue = String(value).trim();
  const date = new Date(stringValue);
  if (!isValidDate(date)) throw new Error(`Cannot parse "${String(value)}" as date`);

  const isoDate = date.toISOString().split("T")[0];
  if (ISO_DATE_ONLY_REGEX.test(stringValue) && isoDate !== stringValue) {
    throw new Error(`Cannot parse "${String(value)}" as date`);
  }

  return date.toISOString();
};

const parseAsBoolean = (value: unknown): boolean => {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
  }
  throw new Error(`Cannot parse "${String(value)}" as boolean`);
};

/**
 * Parse a value intelligently to a target type.
 */
const parseValue = (value: unknown, toType: CastableType): unknown => {
  switch (toType) {
    case "number": {
      if (typeof value === "string" && value.trim() === "") {
        throw new Error(`Cannot parse "${value}" as number`);
      }

      const num = Number(typeof value === "string" ? value.trim() : value);
      if (Number.isNaN(num)) throw new Error(`Cannot parse "${String(value)}" as number`);
      return num;
    }
    case "boolean":
      return parseAsBoolean(value);
    case "date":
      return parseAsDate(value);
    case "string":
      return String(value);
    default:
      throw new Error(`Cannot parse to type: ${toType}`);
  }
};

/**
 * Cast a value directly to a target type.
 */
const castValue = (value: unknown, toType: CastableType): unknown => {
  switch (toType) {
    case "string":
      return String(value);
    case "number":
      return Number(value);
    case "boolean":
      return Boolean(value);
    default:
      throw new Error(`Cannot cast to type: ${toType}`);
  }
};

/**
 * Run a custom transformation function.
 */
const runCustomTransform = (value: unknown, customCode: string): unknown => {
  try {
    // Create a simple function context (synchronous for performance)
    // SAFETY: This is intentional - custom transforms are user-defined code that dataset
    // administrators configure. The transform code runs in a limited context with only
    // the value and helper functions available (no access to globals, DOM, or Node APIs).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval
    const fn = new Function("value", "context", customCode) as (value: unknown, context: unknown) => unknown;

    const context = {
      parse: {
        date: (v: unknown) => parseValue(v, "date"),
        number: (v: unknown) => parseValue(v, "number"),
        boolean: (v: unknown) => parseValue(v, "boolean"),
      },
    };

    return fn(value, context);
  } catch (error) {
    throw new Error(`Custom transform failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Get value at path using dot notation.
 *
 * Supports nested paths like "user.email" or "coordinates.0".
 * Returns undefined if any part of the path doesn't exist.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path string (e.g., "user.email")
 * @returns Value at the path, or undefined if not found
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com" } };
 * getByPath(obj, "user.email"); // Returns: "test@example.com"
 * getByPath(obj, "user.phone"); // Returns: undefined
 * ```
 */
export const getByPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce((current: unknown, key: string) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

/**
 * Set value at path using dot notation.
 *
 * Creates nested objects as needed along the path.
 * Supports setting values in nested structures.
 *
 * @param obj - The object to modify (mutated in place)
 * @param path - Dot-separated path string (e.g., "user.email")
 * @param value - Value to set at the path
 *
 * @example
 * ```typescript
 * const obj = {};
 * setByPath(obj, "user.email", "test@example.com");
 * // Result: { user: { email: "test@example.com" } }
 * ```
 */
export const setByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    throw new Error(`Invalid path: ${path}`);
  }

  // Navigate/create nested structure
  const target = keys.reduce((current: Record<string, unknown>, key: string) => {
    // Create nested object if it doesn't exist
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    return current[key] as Record<string, unknown>;
  }, obj);

  // Set the value at the target
  target[lastKey] = value;
};

/**
 * Delete value at path using dot notation.
 *
 * Removes the property at the specified path.
 * Does nothing if the path doesn't exist.
 * Does not clean up empty parent objects.
 *
 * @param obj - The object to modify (mutated in place)
 * @param path - Dot-separated path string (e.g., "user.email")
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com", name: "John" } };
 * deleteByPath(obj, "user.email");
 * // Result: { user: { name: "John" } }
 * ```
 */
export const deleteByPath = (obj: Record<string, unknown>, path: string): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    return;
  }

  // Navigate to parent object
  const parent = keys.reduce((current: unknown, key: string) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);

  // Delete the property if parent exists and is an object
  if (parent && typeof parent === "object") {
    delete (parent as Record<string, unknown>)[lastKey];
  }
};

/**
 * Apply transforms to an array of data objects.
 *
 * Convenience function for batch processing.
 * Each object is transformed independently.
 *
 * @param dataArray - Array of data objects to transform
 * @param transforms - Array of transform rules to apply
 * @returns Array of transformed data objects
 *
 * @example
 * ```typescript
 * const rows = [
 *   { date: "2024-01-15", name: "Event 1" },
 *   { date: "2024-01-16", name: "Event 2" }
 * ];
 * const transforms = [
 *   { type: "rename", from: "date", to: "start_date", active: true }
 * ];
 * const result = applyTransformsBatch(rows, transforms);
 * // Returns array with start_date instead of date
 * ```
 */
export const applyTransformsBatch = (
  dataArray: Record<string, unknown>[],
  transforms: ImportTransform[]
): Record<string, unknown>[] => dataArray.map((data) => applyTransforms(data, transforms));
