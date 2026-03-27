/**
 * Pre-processes JSON records before CSV conversion.
 *
 * Supports grouping records by a key field and merging date/numeric fields
 * using min/max strategies. Used for data sources that return repeated entries
 * for recurring events (e.g. one row per day for a multi-day exhibition).
 *
 * @module
 * @category Import
 */

import { logger } from "@/lib/logger";

/** Merge strategy for a field: keep the minimum or maximum value. */
type MergeStrategy = "min" | "max";

/** Configuration for JSON record pre-processing. */
export interface PreProcessingConfig {
  /** Field path to group records by (e.g. "uid"). */
  groupBy: string;
  /** Fields to merge with min/max strategy (e.g. { startDate: "min", endDate: "max" }). */
  mergeFields: Record<string, MergeStrategy>;
}

/**
 * Group records by a key and merge specified fields using min/max.
 *
 * Records sharing the same `groupBy` value are collapsed into a single record.
 * The first record in each group provides the base values; `mergeFields` are
 * then replaced with the min or max across the group.
 *
 * @returns Deduplicated records with merged date ranges.
 */
export const preProcessRecords = (
  records: Record<string, unknown>[],
  config?: PreProcessingConfig | null
): Record<string, unknown>[] => {
  if (!config?.groupBy || records.length === 0) return records;

  const { groupBy, mergeFields } = config;
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const record of records) {
    const key = String(record[groupBy] ?? "");
    if (!key) continue;
    const group = groups.get(key);
    if (group) {
      group.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const merged = Array.from(groups.values()).map((group) => mergeGroup(group, mergeFields));

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
    const values = group
      .map((r) => r[field])
      .filter((v): v is string | number => v != null && v !== "")
      .map((v) => (typeof v === "number" ? v : new Date(String(v)).getTime()))
      .filter((t) => !Number.isNaN(t));

    if (values.length === 0) continue;

    const result = strategy === "min" ? Math.min(...values) : Math.max(...values);

    // Preserve original format: if the source was a date string, output ISO string
    const originalValue = group[0]![field];
    if (typeof originalValue === "string") {
      const date = new Date(result);
      // Match the original format: "YYYY-MM-DD HH:MM:SS" or ISO
      if (originalValue.includes("T")) {
        merged[field] = date.toISOString();
      } else {
        const pad = (n: number) => String(n).padStart(2, "0");
        merged[field] =
          `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
          `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      }
    } else {
      merged[field] = result;
    }
  }

  return merged;
};
