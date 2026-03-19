/**
 * Pattern detection adapters for schema building.
 *
 * Re-exports utility functions from the shared `@timetiles/payload-schema-detection`
 * package and provides thin adapters that bridge the app's `SchemaBuilderState`
 * interface with the package's stateless API.
 *
 * `detectEnums` is app-specific because it mutates `FieldStatistics` in place
 * (setting `isEnumCandidate` and `enumValues`), whereas the package's
 * `detectEnumFields` returns a pure list of field paths.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import { detectIdFields as detectIdFieldsFromStats } from "@timetiles/payload-schema-detection/utilities";

import type { SchemaBuilderState } from "@/lib/types/schema-detection";

// Re-export identical utilities from the shared package (single source of truth)
export { looksLikeCoordinate, looksLikeId } from "@timetiles/payload-schema-detection/utilities";

/**
 * Detects potential ID fields based on naming patterns and characteristics.
 *
 * Thin adapter: extracts `fieldStats` from the builder state and delegates
 * to the shared package implementation.
 */
export const detectIdFields = (state: SchemaBuilderState): string[] => {
  return detectIdFieldsFromStats(state.fieldStats);
};

/**
 * Detects enumeration fields and mutates field statistics in place.
 *
 * Unlike the package's pure `detectEnumFields` (which returns field paths),
 * this function sets `stats.isEnumCandidate` and `stats.enumValues` directly
 * on the state — callers depend on this mutation behavior.
 */
export const detectEnums = (
  state: SchemaBuilderState,
  config: { enumThreshold: number; enumMode: "count" | "percentage" }
): void => {
  for (const stats of Object.values(state.fieldStats)) {
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
    if (hasStringType && stats.uniqueSamples) {
      const shouldBeEnum =
        config.enumMode === "count"
          ? stats.uniqueValues <= config.enumThreshold
          : stats.uniqueValues / stats.occurrences <= config.enumThreshold / 100;

      if (shouldBeEnum && stats.uniqueValues > 1 && stats.uniqueValues < stats.occurrences) {
        stats.isEnumCandidate = true;
        // Create enum values from unique samples
        const valueCounts = new Map<unknown, number>();
        for (const sample of stats.uniqueSamples) {
          valueCounts.set(sample, (valueCounts.get(sample) ?? 0) + 1);
        }
        stats.enumValues = Array.from(valueCounts.entries()).map(([value, count]) => ({
          value,
          count,
          percent: (count / stats.occurrences) * 100,
        }));
      }
    }
  }
};
