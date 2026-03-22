/**
 * Job handler for creating schema versions for both auto-approved and manually-approved schemas.
 *
 * This job is queued after schema validation (for auto-approved changes) or after manual approval
 * to create the schema version in a separate transaction, avoiding circular dependencies and deadlocks.
 *
 * @module
 */
import type { PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { SchemaVersioningService } from "@/lib/ingest/schema-versioning";
import { createJobLogger, logError } from "@/lib/logger";
import { getFieldStats } from "@/lib/types/schema-detection";

import type { CreateSchemaVersionJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { loadDataset, loadIngestJob } from "../utils/resource-loading";

// Helper to check if schema version creation should be skipped
const shouldSkipSchemaVersionCreation = (job: {
  datasetSchemaVersion?: unknown;
  schemaValidation?: { approved?: boolean | null; requiresApproval?: boolean | null };
}): { skip: boolean; reason: string } => {
  let result: { skip: boolean; reason: string } = { skip: false, reason: "" };

  if (job.datasetSchemaVersion) {
    result = { skip: true, reason: "Schema version already exists" };
  } else if (job.schemaValidation?.requiresApproval && !job.schemaValidation?.approved) {
    // Only skip if manual approval required but not yet approved
    // Auto-approved cases have requiresApproval=false, so they proceed
    result = { skip: true, reason: "Schema not approved" };
  }

  return result;
};

// Helper to extract approvedBy user ID
const getApprovedById = (approvedBy: unknown): number | null => {
  // If it's a populated user object with an id property
  if (typeof approvedBy === "object" && approvedBy && "id" in approvedBy) {
    return approvedBy.id as number;
  }
  // If it's a direct user ID
  if (typeof approvedBy === "number") {
    return approvedBy;
  }
  // Otherwise null
  return null;
};

export const createSchemaVersionJob = {
  slug: JOB_TYPES.CREATE_SCHEMA_VERSION,
  retries: 1,
  outputSchema: [
    { name: "versionNumber", type: "number" as const },
    { name: "skipped", type: "checkbox" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: async (args: TaskCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errorLog: {
            lastError: typeof args.job.error === "string" ? args.job.error : "Task failed after all retries",
            context: "create-schema-version",
          },
        },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CreateSchemaVersionJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-schema-version");
    logger.info("Creating schema version after approval", { ingestJobId });

    try {
      // Get import job
      const job = await loadIngestJob(payload, ingestJobId);

      // Set stage for UI progress tracking (workflow controls sequencing)
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.CREATE_SCHEMA_VERSION },
      });

      // Start CREATE_SCHEMA_VERSION stage
      const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
      await ProgressTrackingService.startStage(
        payload,
        ingestJobId,
        PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
        uniqueRows
      );

      // Check if we should skip
      const skipCheck = shouldSkipSchemaVersionCreation(job);
      if (skipCheck.skip) {
        logger.info("Skipping schema version creation", { ingestJobId, reason: skipCheck.reason });
        await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_SCHEMA_VERSION);

        return { output: { skipped: true } };
      }

      // Get dataset and prepare schema version data
      const dataset = await loadDataset(payload, job.dataset);
      const fieldStats = getFieldStats(job);

      // Determine if this is auto-approved or manual-approved
      const isAutoApproved = !job.schemaValidation?.requiresApproval;
      const approvedById = isAutoApproved ? null : getApprovedById(job.schemaValidation?.approvedBy);

      logger.info("Creating schema version", { ingestJobId, datasetId: dataset.id, isAutoApproved, approvedById });

      // Create schema version
      const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
        dataset: dataset.id,
        schema: job.schema,
        fieldMetadata: fieldStats || {},
        fieldMappings: job.detectedFieldMappings,
        autoApproved: isAutoApproved,
        approvedBy: approvedById,
        ingestSources: [],
        req: context.req as PayloadRequest | undefined,
      });

      // Update job with schema version
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { datasetSchemaVersion: schemaVersion.id },
      });

      logger.info("Schema version created successfully", { ingestJobId, schemaVersionId: schemaVersion.id });

      // Complete CREATE_SCHEMA_VERSION stage
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_SCHEMA_VERSION);

      return { output: { versionNumber: schemaVersion.versionNumber, schemaVersionId: schemaVersion.id } };
    } catch (error) {
      logError(error, "Failed to create schema version", { ingestJobId });

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
