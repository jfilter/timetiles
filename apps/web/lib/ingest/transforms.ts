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

import { Parser } from "expr-eval";

import type {
  ConcatenateTransform,
  DateParseTransform,
  IngestTransform,
  ParseJsonArrayTransform,
  RenameTransform,
  SplitTransform,
  StringOpTransform,
} from "@/lib/types/ingest-transforms";
import { isValidDate } from "@/lib/utils/date";
import { deleteByPath, getByPath, setByPath } from "@/lib/utils/object-path";

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
  transforms: IngestTransform[]
): Record<string, unknown> => {
  // Shallow copy to avoid mutating input (safe: CSV/Excel rows are flat string/number maps)
  const result = { ...data };

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
      case "parse-json-array":
        applyParseJsonArrayTransform(result, transform);
        break;
    }
  }

  return result;
};

/**
 * Apply transforms to an array of rows for preview display.
 *
 * Uses the same transform engine as the import pipeline to ensure
 * preview results match actual import behavior.
 */
export const applyPreviewTransforms = (
  dataArray: Record<string, unknown>[],
  transforms: IngestTransform[]
): Record<string, unknown>[] => {
  const active = transforms.filter((t) => t.active);
  if (active.length === 0) return dataArray;
  return dataArray.map((row) => applyTransforms(row, active));
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
    const num = Number.parseInt(parts[i]!, 10);
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

  const get = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
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
    case "replace":
      if (transform.pattern === undefined) {
        result = value;
      } else {
        result = value.replaceAll(transform.pattern, transform.replacement ?? "");
      }
      break;
    case "expression":
      if (transform.expression) {
        try {
          const exprResult = runCustomTransform(value, transform.expression);
          if (typeof exprResult === "number" || typeof exprResult === "boolean") {
            setByPath(data, transform.from, exprResult);
            return;
          }
          result = String(exprResult);
        } catch {
          result = value;
        }
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
 * Apply a parse-json-array transform to convert a JSON-stringified array back to a native array.
 *
 * Handles values like `'["Kabarett","Kultur"]'` from JSON→CSV serialization.
 * Non-string values and invalid JSON are silently skipped.
 */
const applyParseJsonArrayTransform = (data: Record<string, unknown>, transform: ParseJsonArrayTransform): void => {
  const value = getByPath(data, transform.from);
  if (typeof value !== "string") return;

  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const target = transform.to ?? transform.from;
      setByPath(
        data,
        target,
        parsed.map((v) => (v == null ? "" : String(v)))
      );
    }
  } catch {
    // Not valid JSON — keep original string value
  }
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
 * Create a safe expression parser with predefined helper functions.
 *
 * Uses expr-eval instead of new Function() to prevent arbitrary code execution.
 * Only supports mathematical and string expressions — no access to require,
 * process, global, or any Node.js APIs.
 */
const createSafeParser = (): Parser => {
  const parser = new Parser({ allowMemberAccess: false });

  // String functions
  parser.functions.upper = (v: unknown) => String(v).toUpperCase();
  parser.functions.lower = (v: unknown) => String(v).toLowerCase();
  parser.functions.trim = (v: unknown) => String(v).trim();
  parser.functions.len = (v: unknown) => String(v).length;
  parser.functions.concat = (...args: unknown[]) => args.map(String).join("");
  parser.functions.toString = (v: unknown) => String(v);
  parser.functions.replace = (v: unknown, pattern: unknown, replacement: unknown) =>
    String(v).replaceAll(String(pattern), String(replacement));
  parser.functions.substring = (v: unknown, start: unknown, end?: unknown) =>
    end !== undefined ? String(v).substring(Number(start), Number(end)) : String(v).substring(Number(start));
  parser.functions.includes = (v: unknown, search: unknown) => (String(v).includes(String(search)) ? 1 : 0);
  parser.functions.startsWith = (v: unknown, search: unknown) => (String(v).startsWith(String(search)) ? 1 : 0);
  parser.functions.endsWith = (v: unknown, search: unknown) => (String(v).endsWith(String(search)) ? 1 : 0);

  // Type conversion functions
  parser.functions.toNumber = (v: unknown) => Number(v);
  parser.functions.parseNumber = (v: unknown) => {
    if (typeof v === "string" && v.trim() === "") throw new Error(`Cannot parse "${v}" as number`);
    const num = Number(typeof v === "string" ? v.trim() : v);
    if (Number.isNaN(num)) throw new Error(`Cannot parse "${String(v)}" as number`);
    return num;
  };
  parser.functions.parseDate = (v: unknown) => parseAsDate(v);
  parser.functions.parseBool = (v: unknown) => parseAsBoolean(v);

  // Conditional
  parser.functions.ifEmpty = (v: unknown, fallback: unknown) => {
    const s = String(v).trim();
    return s === "" || s === "null" || s === "undefined" ? fallback : v;
  };

  return parser;
};

/** Singleton parser instance — safe to reuse across calls. */
const safeParser = createSafeParser();

/**
 * Run a custom transformation expression.
 *
 * Uses expr-eval to evaluate the expression in a sandboxed context.
 * The expression has access to `value` and predefined helper functions only.
 * No access to require, process, global, or any Node.js APIs.
 */
const runCustomTransform = (value: unknown, expression: string): unknown => {
  try {
    const parsed = safeParser.parse(expression);
    return parsed.evaluate({ value: value as string | number });
  } catch (error) {
    throw new Error(`Custom transform failed: ${error instanceof Error ? error.message : String(error)}`);
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
  transforms: IngestTransform[]
): Record<string, unknown>[] => dataArray.map((data) => applyTransforms(data, transforms));
