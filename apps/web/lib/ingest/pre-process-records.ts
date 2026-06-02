/**
 * Pre-processes JSON records before CSV conversion.
 *
 * Supports extracting nested JSON paths into flat fields, grouping
 * records by a key field, and merging date/numeric fields using min/max
 * strategies.
 *
 * @module
 * @category Import
 */

import { logger } from "@/lib/logger";
import { parseImportDate } from "@/lib/utils/date-parsing";
import { decideNumberFormat, type NumberFormat, parseLocaleNumber } from "@/lib/utils/number-parsing";
import { getByPath } from "@/lib/utils/object-path";

/** Merge strategy for a field: keep the minimum or maximum value. */
type MergeStrategy = "min" | "max";

/** Configuration for extracting nested paths into flat fields. */
export interface ExtractFieldConfig {
  /** Dot-path to extract (e.g., "locations.0.geography.coordinates.1"). */
  from: string;
  /** Target flat field name (e.g., "latitude"). */
  to: string;
  /** For arrays of objects: extract this sub-path from each element and join. */
  joinPath?: string;
  /** Join separator (default: ", "). */
  separator?: string;
}

/** Configuration for JSON record pre-processing. */
export interface PreProcessingConfig {
  /** Field path to group records by (e.g. "uid"). */
  groupBy?: string;
  /** Fields to merge with min/max strategy (e.g. { startDate: "min", endDate: "max" }). */
  mergeFields?: Record<string, MergeStrategy>;
  /** Extract nested JSON paths into flat top-level fields before flattening. */
  extractFields?: ExtractFieldConfig[];
}

type ParsedMergeValue =
  | { kind: "number"; comparable: number; original: string | number }
  | { kind: "date"; comparable: number; original: string };

const parseMergeValue = (value: unknown, numberFormat: NumberFormat | null): ParsedMergeValue | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { kind: "number", comparable: value, original: value } : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  // When the field resolved to a numeric column, parse under its per-column
  // locale convention (decided once in `mergeGroup` from all the field's values,
  // never guessed per row); otherwise fall through to date parsing.
  if (numberFormat) {
    const parsed = parseLocaleNumber(trimmed, numberFormat);
    if (parsed !== null) {
      return { kind: "number", comparable: parsed, original: value };
    }
  }

  const parsedDate = parseImportDate(trimmed);
  if (!parsedDate) {
    return null;
  }

  return { kind: "date", comparable: parsedDate.getTime(), original: value };
};

/**
 * Apply extractFields to a single record: resolve nested dot-paths and
 * create flat top-level fields.
 */
const applyExtractFields = (record: Record<string, unknown>, extractions: ExtractFieldConfig[]): void => {
  for (const { from, to, joinPath, separator } of extractions) {
    if (joinPath) {
      // Array join mode: extract sub-path from each element and join
      const arr = getByPath(record, from);
      if (Array.isArray(arr)) {
        const values = arr
          .map((item) => (typeof item === "object" && item !== null ? getByPath(item, joinPath) : undefined))
          .filter((v) => v != null)
          .map(String);
        record[to] = values.join(separator ?? ", ");
      }
    } else {
      // Simple extraction: resolve dot-path to a scalar value
      const value = getByPath(record, from);
      if (value !== undefined) {
        record[to] = value;
      }
    }
  }
};

/**
 * Pre-process JSON records before CSV conversion.
 *
 * Processing order:
 * 1. Extract nested fields (if `extractFields` configured)
 * 2. Group and merge records (if `groupBy` configured)
 *
 * @returns Processed records ready for CSV flattening.
 */
export const preProcessRecords = (
  records: Record<string, unknown>[],
  config?: PreProcessingConfig | null
): Record<string, unknown>[] => {
  if (!config || records.length === 0) return records;

  // Step 1: Extract nested fields into flat top-level fields
  if (config.extractFields?.length) {
    for (const record of records) {
      applyExtractFields(record, config.extractFields);
    }
    logger.info("Extract fields complete", { extractedFields: config.extractFields.length, records: records.length });
  }

  // Step 2: Group and merge (existing behavior)
  if (!config.groupBy) return records;

  const { groupBy, mergeFields } = config;
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const record of records) {
    const key = String((record[groupBy] as string) ?? "");
    if (!key) continue;
    const group = groups.get(key);
    if (group) {
      group.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const merged = Array.from(groups.values()).map((group) => mergeGroup(group, mergeFields ?? {}));

  logger.info("Pre-processing complete", {
    inputRecords: records.length,
    outputRecords: merged.length,
    groupsCollapsed: records.length - merged.length,
  });

  return merged;
};

/** Merge a group of records: take the first as base, apply min/max on merge fields. */
const mergeGroup = (
  group: Record<string, unknown>[],
  mergeFields: Record<string, MergeStrategy>
): Record<string, unknown> => {
  if (group.length === 1) return group[0]!;

  const merged = { ...group[0]! };

  for (const [field, strategy] of Object.entries(mergeFields)) {
    const rawEntries = group
      .map((record) => record[field])
      .filter((value): value is string | number => value != null && value !== "");

    if (rawEntries.length === 0) {
      continue;
    }

    // Decide the field's number convention ONCE from all its string values
    // (per-column), so EU values like "1.234,56" parse consistently. Returns
    // null for non-numeric (date) or contradictory columns → number parsing is
    // then skipped and the values fall through to date parsing.
    const numberFormat = decideNumberFormat(rawEntries.filter((value): value is string => typeof value === "string"));
    const parsedEntries = rawEntries.map((value) => ({ raw: value, parsed: parseMergeValue(value, numberFormat) }));
    const invalidCount = parsedEntries.filter((entry) => entry.parsed === null).length;

    if (invalidCount > 0) {
      logger.warn("Skipping merge field with invalid values", { field, invalidCount, totalValues: rawEntries.length });
      continue;
    }

    const validEntries = parsedEntries.map((entry) => entry.parsed!);
    const kinds = new Set(validEntries.map((entry) => entry.kind));
    if (kinds.size > 1) {
      logger.warn("Skipping merge field with mixed value types", { field, valueKinds: Array.from(kinds) });
      continue;
    }

    const [firstEntry, ...remainingEntries] = validEntries;
    if (!firstEntry) {
      continue;
    }

    const winningEntry = remainingEntries.reduce((best, current) => {
      const isBetter = strategy === "min" ? current.comparable < best.comparable : current.comparable > best.comparable;
      return isBetter ? current : best;
    }, firstEntry);

    const firstValue = rawEntries[0];
    if (winningEntry.kind === "number") {
      merged[field] = typeof firstValue === "number" ? winningEntry.comparable : String(winningEntry.original);
    } else {
      merged[field] = winningEntry.original;
    }
  }

  return merged;
};
