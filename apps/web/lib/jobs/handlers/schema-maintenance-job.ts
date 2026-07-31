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

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import type { SchemaFreshnessResult } from "@/lib/ingest/schema-freshness";
import { countEventsByDataset, getSchemaFreshness } from "@/lib/ingest/schema-freshness";
import { SchemaInferenceService } from "@/lib/ingest/schema-inference";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";

export interface SchemaMaintenanceJobInput {
  /** Optional: specific dataset IDs to check (if omitted, checks all) */
  datasetIds?: number[];
  /** Optional: force regeneration even if schemas appear fresh */
  forceRegenerate?: boolean;
  /** Optional: maximum schemas to REGENERATE in one run (default: 100) */
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

/** A dataset that needs regeneration, plus what made it stale */
interface Candidate {
  dataset: DatasetInfo;
  freshness: SchemaFreshnessResult;
}

const isCandidate = (value: Candidate | ProcessingResult): value is Candidate => "dataset" in value;

export interface SchemaMaintenanceResult {
  success: boolean;
  datasetsChecked: number;
  schemasGenerated: number;
  schemasSkipped: number;
  schemasFailed: number;
  duration: number;
  details?: ProcessingResult[];
  /** True when `details` omits some routine skips (see MAX_ROUTINE_DETAIL_ENTRIES) */
  detailsTruncated?: boolean;
}

/**
 * Get datasets to check for schema staleness.
 *
 * Every dataset is inspected, not the first N. The old `limit: maxDatasets` truncated the
 * scan at a fixed 100 with no cursor and no rotating order, so an installation with more
 * datasets than that re-checked the same head of the list every night and everything past
 * it kept a stale schema forever. The staleness check itself is cheap (a count plus the
 * latest schema version); the run is bounded by capping the expensive regenerations below.
 */
const getDatasetsToCheck = async (payload: Payload, specificIds: number[] | undefined): Promise<DatasetInfo[]> => {
  const datasets = await asSystem(payload).find({
    collection: COLLECTION_NAMES.DATASETS,
    where: specificIds?.length ? { id: { in: specificIds } } : {},
    limit: 0,
    pagination: false,
    sort: "id",
    select: { name: true },
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

/** Decide whether a dataset needs work, without doing any of it */
const evaluateDataset = async (
  payload: Payload,
  dataset: DatasetInfo,
  forceRegenerate: boolean,
  eventCounts: Map<number, number>
): Promise<Candidate | ProcessingResult> => {
  const latestSchema = await SchemaInferenceService.getLatestSchema(payload, dataset.id);
  // Counts come from one grouped query for the whole scan; absent means no events.
  const freshness = await getSchemaFreshness(
    payload,
    dataset.id,
    latestSchema,
    undefined,
    eventCounts.get(dataset.id) ?? 0
  );

  const skipCheck = shouldSkipDataset(freshness, forceRegenerate);
  if (skipCheck.skip) {
    return { datasetId: dataset.id, datasetName: dataset.name, action: "skipped", reason: skipCheck.reason };
  }

  return { dataset, freshness };
};

/** Regenerate the schema of a dataset already known to need it */
const regenerateDataset = async (
  payload: Payload,
  dataset: DatasetInfo,
  freshness: SchemaFreshnessResult,
  forceRegenerate: boolean
): Promise<ProcessingResult> => {
  const result = await SchemaInferenceService.inferSchemaFromEvents(payload, dataset.id, { forceRegenerate });

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

  return { datasetId: dataset.id, datasetName: dataset.name, action: "skipped", reason: result.message };
};

/**
 * Hard ceiling on the persisted `details` array.
 *
 * Entries that needed work come first so a truncated report still shows what happened, but
 * the TOTAL is capped: a systematic failure produces one `failed` entry per dataset, so
 * capping only the routine skips would still let the job record grow with the dataset count.
 */
const MAX_DETAIL_ENTRIES = 200;

const capDetails = (details: ProcessingResult[]): ProcessingResult[] => {
  if (details.length <= MAX_DETAIL_ENTRIES) return details;
  const notable = details.filter((entry) => entry.action !== "skipped");
  const routine = details.filter((entry) => entry.action === "skipped");
  return [...notable, ...routine].slice(0, MAX_DETAIL_ENTRIES);
};

const toFailure = (dataset: DatasetInfo, error: unknown): ProcessingResult => {
  const reason = error instanceof Error ? error.message : String(error);
  logger.warn("Failed to process schema for dataset", { datasetId: dataset.id, error: reason });
  return { datasetId: dataset.id, datasetName: dataset.name, action: "failed", reason };
};

/**
 * Order stale datasets least-recently-serviced first.
 *
 * A dataset with no schema at all has nothing to sort by and goes first; the rest follow by
 * schema age. Regenerating writes a new schema, so a serviced dataset moves to the back —
 * that is what keeps the per-run cap from repeatedly picking the same head of the list.
 */
const byStalestFirst = (a: Candidate, b: Candidate): number => {
  const aAt = a.freshness.schemaCreatedAt;
  const bAt = b.freshness.schemaCreatedAt;
  if (aAt === null || bAt === null) return (aAt === null ? 0 : 1) - (bAt === null ? 0 : 1);
  return Date.parse(aAt) - Date.parse(bAt);
};

/** Check every dataset, then regenerate at most `maxDatasets` of the stale ones */
const processAllDatasets = async (
  payload: Payload,
  datasets: DatasetInfo[],
  forceRegenerate: boolean,
  maxDatasets: number
): Promise<{ details: ProcessingResult[]; stats: ProcessingStats }> => {
  const details: ProcessingResult[] = [];
  const stats: ProcessingStats = { generated: 0, skipped: 0, failed: 0 };
  const candidates: Candidate[] = [];
  const eventCounts = await countEventsByDataset(
    payload,
    datasets.map((dataset) => dataset.id)
  );

  for (const dataset of datasets) {
    try {
      const outcome = await evaluateDataset(payload, dataset, forceRegenerate, eventCounts);
      if (isCandidate(outcome)) {
        candidates.push(outcome);
      } else {
        details.push(outcome);
        stats.skipped++;
      }
    } catch (error) {
      stats.failed++;
      details.push(toFailure(dataset, error));
    }
  }

  candidates.sort(byStalestFirst);

  for (const [index, candidate] of candidates.entries()) {
    if (index >= maxDatasets) {
      details.push({
        datasetId: candidate.dataset.id,
        datasetName: candidate.dataset.name,
        action: "skipped",
        reason: "Deferred to the next run (per-run regeneration limit reached)",
      });
      stats.skipped++;
      continue;
    }

    try {
      const result = await regenerateDataset(payload, candidate.dataset, candidate.freshness, forceRegenerate);
      details.push(result);
      stats[result.action === "generated" ? "generated" : "skipped"]++;
    } catch (error) {
      stats.failed++;
      details.push(toFailure(candidate.dataset, error));
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
    const { payload } = context.req;
    const startTime = Date.now();

    const maxDatasets = input?.maxDatasets ?? 100;
    const forceRegenerate = input?.forceRegenerate ?? false;

    logger.info("Starting schema maintenance job", { datasetIds: input?.datasetIds, forceRegenerate, maxDatasets });

    try {
      const datasets = await getDatasetsToCheck(payload, input?.datasetIds);
      const { details, stats } = await processAllDatasets(payload, datasets, forceRegenerate, maxDatasets);
      const duration = Date.now() - startTime;

      const cappedDetails = capDetails(details);

      logger.info("Schema maintenance completed", { datasetsChecked: datasets.length, ...stats, duration });

      return {
        output: {
          success: true,
          datasetsChecked: datasets.length,
          schemasGenerated: stats.generated,
          schemasSkipped: stats.skipped,
          schemasFailed: stats.failed,
          duration,
          // The scan covers every dataset, but this array is persisted verbatim in the job
          // record. Report every dataset that actually needed work and only a sample of the
          // "nothing to do" ones, so the output cannot grow with the dataset count.
          details: cappedDetails,
          detailsTruncated: cappedDetails.length < details.length,
        },
      };
    } catch (error) {
      logError(error, "Schema maintenance job failed");
      throw error;
    }
  },
};
