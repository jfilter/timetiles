/**
 * Schema Maintenance Job Handler.
 *
 * This job periodically checks all datasets for stale schemas and regenerates
 * them as needed. It runs on a schedule to keep schemas up-to-date without
 * requiring manual intervention.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logger } from "@/lib/logger";
import type { SchemaFreshnessResult } from "@/lib/services/schema-freshness";
import { getSchemaFreshness } from "@/lib/services/schema-freshness";
import { SchemaInferenceService } from "@/lib/services/schema-inference-service";

export interface SchemaMaintenanceJobInput {
  /** Optional: specific dataset IDs to check (if omitted, checks all) */
  datasetIds?: number[];
  /** Optional: force regeneration even if schemas appear fresh */
  forceRegenerate?: boolean;
  /** Optional: maximum datasets to process in one run (default: 100) */
  maxDatasets?: number;
}

interface DatasetInfo {
  id: number;
  name: string;
}

interface ProcessingResult {
  datasetId: number;
  datasetName: string;
  action: "generated" | "skipped" | "failed";
  reason?: string;
}

interface ProcessingStats {
  generated: number;
  skipped: number;
  failed: number;
}

export interface SchemaMaintenanceResult {
  success: boolean;
  datasetsChecked: number;
  schemasGenerated: number;
  schemasSkipped: number;
  schemasFailed: number;
  duration: number;
  details?: ProcessingResult[];
}

/** Get datasets to check for schema staleness */
const getDatasetsToCheck = async (
  payload: Payload,
  specificIds: number[] | undefined,
  maxDatasets: number
): Promise<DatasetInfo[]> => {
  const datasets = await payload.find({
    collection: COLLECTION_NAMES.DATASETS,
    where: specificIds?.length ? { id: { in: specificIds } } : {},
    limit: maxDatasets,
    overrideAccess: true,
  });

  return datasets.docs.map((d) => ({ id: d.id, name: d.name }));
};

/** Check if a dataset needs schema regeneration */
const shouldSkipDataset = (
  freshness: SchemaFreshnessResult,
  forceRegenerate: boolean
): { skip: boolean; reason?: string } => {
  if (!freshness.stale && !forceRegenerate) {
    return { skip: true, reason: "Schema is up-to-date" };
  }
  if (freshness.currentEventCount === 0) {
    return { skip: true, reason: "No events in dataset" };
  }
  return { skip: false };
};

/** Process a single dataset for schema maintenance */
const processDataset = async (
  payload: Payload,
  dataset: DatasetInfo,
  forceRegenerate: boolean
): Promise<ProcessingResult> => {
  const latestSchema = await SchemaInferenceService.getLatestSchema(payload, dataset.id);
  const freshness = await getSchemaFreshness(payload, dataset.id, latestSchema);

  const skipCheck = shouldSkipDataset(freshness, forceRegenerate);
  if (skipCheck.skip) {
    return {
      datasetId: dataset.id,
      datasetName: dataset.name,
      action: "skipped",
      reason: skipCheck.reason,
    };
  }

  const result = await SchemaInferenceService.inferSchemaFromEvents(payload, dataset.id, {
    forceRegenerate,
  });

  if (result.generated) {
    logger.info("Schema regenerated for dataset", {
      datasetId: dataset.id,
      datasetName: dataset.name,
      reason: freshness.reason,
      eventsSampled: result.eventsSampled,
    });
    return {
      datasetId: dataset.id,
      datasetName: dataset.name,
      action: "generated",
      reason: `Generated from ${result.eventsSampled} events (${freshness.reason ?? "forced"})`,
    };
  }

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    action: "skipped",
    reason: result.message,
  };
};

/** Process all datasets and collect results */
const processAllDatasets = async (
  payload: Payload,
  datasets: DatasetInfo[],
  forceRegenerate: boolean
): Promise<{ details: ProcessingResult[]; stats: ProcessingStats }> => {
  const details: ProcessingResult[] = [];
  const stats: ProcessingStats = { generated: 0, skipped: 0, failed: 0 };

  for (const dataset of datasets) {
    try {
      const result = await processDataset(payload, dataset, forceRegenerate);
      details.push(result);
      stats[result.action === "generated" ? "generated" : "skipped"]++;
    } catch (error) {
      stats.failed++;
      details.push({
        datasetId: dataset.id,
        datasetName: dataset.name,
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
      logger.warn("Failed to process schema for dataset", {
        datasetId: dataset.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { details, stats };
};

/**
 * Schema maintenance job handler
 */
export const schemaMaintenanceJob = {
  slug: "schema-maintenance",
  /**
   * Run daily at 3 AM to check and regenerate stale schemas
   * Cron format: minute hour day month weekday
   */
  schedule: [
    {
      cron: "0 3 * * *", // Every day at 3:00 AM
      queue: "maintenance",
    },
  ],
  retries: 2,
  waitUntil: 600000, // 10 minutes timeout
  handler: async (context: JobHandlerContext): Promise<{ output: SchemaMaintenanceResult }> => {
    const input = (context.input ?? context.job?.input) as SchemaMaintenanceJobInput | undefined;
    const payload = context.payload as Payload;
    const startTime = Date.now();

    const maxDatasets = input?.maxDatasets ?? 100;
    const forceRegenerate = input?.forceRegenerate ?? false;

    logger.info("Starting schema maintenance job", {
      datasetIds: input?.datasetIds,
      forceRegenerate,
      maxDatasets,
    });

    try {
      const datasets = await getDatasetsToCheck(payload, input?.datasetIds, maxDatasets);
      const { details, stats } = await processAllDatasets(payload, datasets, forceRegenerate);
      const duration = Date.now() - startTime;

      logger.info("Schema maintenance completed", {
        datasetsChecked: datasets.length,
        ...stats,
        duration,
      });

      return {
        output: {
          success: true,
          datasetsChecked: datasets.length,
          schemasGenerated: stats.generated,
          schemasSkipped: stats.skipped,
          schemasFailed: stats.failed,
          duration,
          details,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error("Schema maintenance job failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        output: {
          success: false,
          datasetsChecked: 0,
          schemasGenerated: 0,
          schemasSkipped: 0,
          schemasFailed: 0,
          duration,
        },
      };
    }
  },
};
