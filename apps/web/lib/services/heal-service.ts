/**
 * Detect and fix data inconsistencies across the system.
 *
 * Provides a set of "heal" checks that find and optionally repair
 * mismatched or missing data. Can be run via CLI (`make heal`) or
 * Admin API (`POST /api/admin/heal`).
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { createLogger } from "@/lib/logger";
import { createFieldStats, updateFieldStats } from "@/lib/services/schema-builder/field-statistics";
import { enrichEnumFields } from "@/lib/services/schema-detection/utilities";
import type { FieldStatistics } from "@/lib/types/schema-detection";

const logger = createLogger("heal");

const MAX_UNIQUE_VALUES = 100;
const ENUM_CONFIG = { enumThreshold: 30, enumMode: "count" as const };

/** Sample 5% of events, min 100, max 2000. */
const sampleSize = (total: number) => Math.min(2000, Math.max(100, Math.ceil(total * 0.05)));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealResult {
  check: string;
  fixed: number;
  skipped: number;
  errors: number;
  details: string[];
}

export interface HealOptions {
  dryRun?: boolean;
  checks?: string[];
}

// ---------------------------------------------------------------------------
// Individual heal checks
// ---------------------------------------------------------------------------

/**
 * Sync fieldMetadata from DatasetSchema to Dataset.
 *
 * Finds datasets with events but no fieldMetadata. For each:
 * 1. Try copying from latest DatasetSchema
 * 2. If no schema, generate from event sample
 */
const healFieldMetadata = async (payload: Payload, dryRun: boolean): Promise<HealResult> => {
  const result: HealResult = { check: "field-metadata-sync", fixed: 0, skipped: 0, errors: 0, details: [] };

  // Find datasets with events but missing or stale fieldMetadata
  // (includes datasets where occurrencePercent was never calculated)
  const allDatasets = await payload.find({
    collection: COLLECTION_NAMES.DATASETS,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const datasets = {
    docs: allDatasets.docs.filter((d) => {
      if (!d.fieldMetadata) return true;
      // Check for stale fieldMetadata (occurrencePercent = 0 on all fields)
      const fm = d.fieldMetadata as Record<string, { occurrencePercent?: number }>;
      const fields = Object.values(fm);
      return fields.length > 0 && fields.every((f) => !f.occurrencePercent);
    }),
  };

  for (const dataset of datasets.docs) {
    // Check if dataset actually has events
    const eventCount = await payload.count({
      collection: COLLECTION_NAMES.EVENTS,
      where: { dataset: { equals: dataset.id } },
      overrideAccess: true,
    });

    if (eventCount.totalDocs === 0) {
      result.skipped++;
      continue;
    }

    try {
      // Try copying from latest schema version
      const schemas = await payload.find({
        collection: COLLECTION_NAMES.DATASET_SCHEMAS,
        where: { dataset: { equals: dataset.id } },
        sort: "-versionNumber",
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });

      let fieldMetadata: Record<string, FieldStatistics> | null = null;

      const schemaFm = schemas.docs[0]?.fieldMetadata as Record<string, FieldStatistics> | undefined;
      const schemaHasValidStats =
        schemaFm && Object.keys(schemaFm).length > 0 && Object.values(schemaFm).some((f) => f.occurrencePercent > 0);

      if (schemaHasValidStats) {
        fieldMetadata = schemaFm;
        result.details.push(`${dataset.name}: copied from schema v${schemas.docs[0]!.versionNumber}`);
      } else {
        // Generate from event sample
        fieldMetadata = await generateFieldMetadataFromEvents(payload, dataset.id);
        if (fieldMetadata) {
          result.details.push(`${dataset.name}: generated from ${eventCount.totalDocs} events`);
        }
      }

      if (!fieldMetadata) {
        result.skipped++;
        continue;
      }

      if (!dryRun) {
        await payload.update({
          collection: COLLECTION_NAMES.DATASETS,
          id: dataset.id,
          data: { fieldMetadata },
          overrideAccess: true,
        });
      }

      result.fixed++;
    } catch (error) {
      result.errors++;
      logger.warn({ datasetId: dataset.id, error }, "Failed to heal fieldMetadata");
    }
  }

  return result;
};

/** Generate fieldMetadata by sampling events. */
const generateFieldMetadataFromEvents = async (
  payload: Payload,
  datasetId: number
): Promise<Record<string, FieldStatistics> | null> => {
  // Sample 5% of events spread across multiple pages for a representative
  // cross-section. Sequential sampling from one region produces skewed results
  // when data is geographically ordered.
  const totalCount = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { dataset: { equals: datasetId } },
    overrideAccess: true,
  });

  if (totalCount.totalDocs === 0) return null;

  const targetSamples = sampleSize(totalCount.totalDocs);
  const pageSize = Math.min(100, targetSamples);
  const totalPages = Math.ceil(totalCount.totalDocs / pageSize);
  const pagesToFetch = Math.ceil(targetSamples / pageSize);
  const stride = Math.max(1, Math.floor(totalPages / pagesToFetch));

  const allDocs = [];
  for (let i = 0; i < pagesToFetch && allDocs.length < targetSamples; i++) {
    const page = Math.min(i * stride + 1, totalPages);
    const result = await payload.find({
      collection: COLLECTION_NAMES.EVENTS,
      where: { dataset: { equals: datasetId } },
      limit: pageSize,
      page,
      sort: "id",
      depth: 0,
      overrideAccess: true,
    });
    allDocs.push(...result.docs);
  }

  const events = { docs: allDocs };

  const fieldStats: Record<string, FieldStatistics> = {};

  for (const event of events.docs) {
    const data = (event.transformedData ?? event.sourceData) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") continue;
    for (const [key, value] of Object.entries(data)) {
      fieldStats[key] ??= createFieldStats(key);
      updateFieldStats(fieldStats[key], value, MAX_UNIQUE_VALUES);
    }
  }

  // Calculate occurrence percentages and detect enums
  for (const stats of Object.values(fieldStats)) {
    stats.occurrencePercent = (stats.occurrences / events.docs.length) * 100;
  }
  enrichEnumFields(fieldStats, ENUM_CONFIG);

  const meaningful = Object.fromEntries(
    Object.entries(fieldStats).filter(([, s]) => s.occurrences > 0 && s.occurrencePercent >= 10)
  );

  return Object.keys(meaningful).length > 0 ? meaningful : null;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const HEAL_CHECKS: Record<string, (payload: Payload, dryRun: boolean) => Promise<HealResult>> = {
  "field-metadata-sync": healFieldMetadata,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Run all (or selected) heal checks. */
export const runHealChecks = async (payload: Payload, options: HealOptions = {}): Promise<HealResult[]> => {
  const { dryRun = false, checks } = options;
  const results: HealResult[] = [];

  const checksToRun = checks
    ? Object.entries(HEAL_CHECKS).filter(([name]) => checks.includes(name))
    : Object.entries(HEAL_CHECKS);

  for (const [name, check] of checksToRun) {
    logger.info("Running heal check: %s%s", name, dryRun ? " (dry run)" : "");
    const result = await check(payload, dryRun);
    results.push(result);
    logger.info("  %s: fixed=%d, skipped=%d, errors=%d", name, result.fixed, result.skipped, result.errors);
  }

  return results;
};
