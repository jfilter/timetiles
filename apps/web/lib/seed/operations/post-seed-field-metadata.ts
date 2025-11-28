/**
 * Post-seeding operation to generate fieldMetadata for datasets.
 *
 * After events are seeded, this analyzes event data fields to detect
 * enum candidates and populates dataset.fieldMetadata for categorical filtering.
 *
 * @module
 * @category Seed
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { createFieldStats, updateFieldStats } from "@/lib/services/schema-builder/field-statistics";
import { detectEnums } from "@/lib/services/schema-builder/pattern-detection";
import type { FieldStatistics } from "@/lib/types/schema-detection";

const logger = createLogger("seed:field-metadata");

/** Maximum unique values to track per field */
const MAX_UNIQUE_VALUES = 100;

/** Enum detection config - fields with <= 30 unique string values are enum candidates */
const ENUM_CONFIG = { enumThreshold: 30, enumMode: "count" as const };

/**
 * Analyze event data to build field statistics.
 */
const analyzeEventData = (
  data: Record<string, unknown>,
  fieldStats: Record<string, FieldStatistics>,
  prefix = ""
): void => {
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;

    // Skip nested objects and arrays for now - focus on leaf values
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      analyzeEventData(value as Record<string, unknown>, fieldStats, path);
      continue;
    }

    // Initialize or update field stats
    if (!fieldStats[path]) {
      fieldStats[path] = createFieldStats(path);
    }
    updateFieldStats(fieldStats[path], value, MAX_UNIQUE_VALUES);
  }
};

/**
 * Finalize field statistics after analyzing all events.
 */
const finalizeFieldStats = (
  fieldStats: Record<string, FieldStatistics>,
  totalEvents: number
): void => {
  // Calculate occurrence percentages
  for (const stats of Object.values(fieldStats)) {
    stats.occurrencePercent = (stats.occurrences / totalEvents) * 100;
  }

  // Detect enum candidates using SchemaBuilderState-like structure
  const state = {
    fieldStats,
    schema: {},
    version: 1,
    recordCount: totalEvents,
    batchCount: 1,
    lastUpdated: new Date(),
    dataSamples: [],
    maxSamples: 100,
    detectedIdFields: [],
    detectedGeoFields: { confidence: 0 },
    typeConflicts: [],
  };
  detectEnums(state, ENUM_CONFIG);

  // Recalculate enum value percentages based on total occurrences (not unique count)
  for (const stats of Object.values(fieldStats)) {
    if (stats.isEnumCandidate && stats.enumValues) {
      // Count actual occurrences of each value
      const valueCounts = new Map<unknown, number>();
      for (const sample of stats.uniqueSamples) {
        valueCounts.set(sample, (valueCounts.get(sample) ?? 0) + 1);
      }

      // For seeded data, we estimate counts proportionally based on unique samples
      // This is approximate since we only track unique samples, not all occurrences
      const totalSamples = stats.uniqueSamples.length;
      stats.enumValues = stats.enumValues.map((ev) => ({
        ...ev,
        // Estimate: each unique value represents roughly equal portion of total
        count: Math.round(stats.occurrences / totalSamples),
        percent: (1 / totalSamples) * 100,
      }));
    }
  }
};

/**
 * Generate fieldMetadata for a single dataset by analyzing its events.
 */
const generateFieldMetadataForDataset = async (
  payload: Payload,
  datasetId: number
): Promise<Record<string, FieldStatistics> | null> => {
  // Fetch events for this dataset (limit to reasonable sample size)
  const events = await payload.find({
    collection: "events",
    where: { dataset: { equals: datasetId } },
    limit: 500, // Sample size for analysis
    depth: 0,
  });

  if (events.docs.length === 0) {
    return null;
  }

  const fieldStats: Record<string, FieldStatistics> = {};

  // Analyze each event's data field
  for (const event of events.docs) {
    if (event.data && typeof event.data === "object") {
      analyzeEventData(event.data as Record<string, unknown>, fieldStats);
    }
  }

  // Finalize statistics and detect enums
  finalizeFieldStats(fieldStats, events.docs.length);

  // Filter to only fields that have meaningful statistics
  const meaningfulStats: Record<string, FieldStatistics> = {};
  for (const [path, stats] of Object.entries(fieldStats)) {
    if (stats.occurrences > 0 && stats.occurrencePercent >= 10) {
      meaningfulStats[path] = stats;
    }
  }

  return Object.keys(meaningfulStats).length > 0 ? meaningfulStats : null;
};

/**
 * Post-seed operation: Generate fieldMetadata for all datasets.
 *
 * Call this after seeding events to enable categorical filters.
 */
export const generateFieldMetadataForAllDatasets = async (payload: Payload): Promise<void> => {
  logger.info("Generating fieldMetadata for datasets...");

  // Get all datasets
  const datasets = await payload.find({
    collection: "datasets",
    limit: 1000,
    depth: 0,
  });

  let updated = 0;
  let skipped = 0;

  for (const dataset of datasets.docs) {
    try {
      const fieldMetadata = await generateFieldMetadataForDataset(payload, dataset.id);

      if (fieldMetadata) {
        await payload.update({
          collection: "datasets",
          id: dataset.id,
          data: { fieldMetadata },
        });
        updated++;
        logger.debug(`Updated fieldMetadata for dataset: ${dataset.name}`);
      } else {
        skipped++;
      }
    } catch (error) {
      logger.warn(`Failed to generate fieldMetadata for dataset ${dataset.id}:`, error);
      skipped++;
    }
  }

  logger.info(`fieldMetadata generation complete: ${updated} updated, ${skipped} skipped`);
};
