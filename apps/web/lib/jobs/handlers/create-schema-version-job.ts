/**
 * Job handler for creating schema versions for both auto-approved and manually-approved schemas.
 *
 * This job is queued after schema validation (for auto-approved changes) or after manual approval
 * to create the schema version in a separate transaction, avoiding circular dependencies and deadlocks.
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError } from "@/lib/logger";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import { getFieldStats } from "@/lib/types/schema-detection";

import type { CreateSchemaVersionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

// Helper to check if schema version creation should be skipped
const shouldSkipSchemaVersionCreation = (job: {
  datasetSchemaVersion?: unknown;
  schemaValidation?: {
    approved?: boolean | null;
    requiresApproval?: boolean | null;
  };
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

// Helper to get dataset from job
const getDatasetFromJob = async (payload: Payload, job: { dataset: unknown }): Promise<{ id: number | string }> => {
  const dataset =
    typeof job.dataset === "object" && job.dataset
      ? job.dataset
      : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: job.dataset as number | string });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  return dataset as { id: number | string };
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
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as CreateSchemaVersionJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-schema-version");
    logger.info("Creating schema version after approval", { importJobId });

    try {
      // Get import job
      const job = await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
      });

      if (!job) {
        throw new Error(`Import job not found: ${importJobId}`);
      }

      // Start CREATE_SCHEMA_VERSION stage
      const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
      await ProgressTrackingService.startStage(
        payload,
        importJobId,
        PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
        uniqueRows
      );

      // Check if we should skip
      const skipCheck = shouldSkipSchemaVersionCreation(job);
      if (skipCheck.skip) {
        logger.info("Skipping schema version creation", { importJobId, reason: skipCheck.reason });
        await ProgressTrackingService.skipStage(payload, importJobId, PROCESSING_STAGE.CREATE_SCHEMA_VERSION);
        return { output: { skipped: true } };
      }

      // Get dataset and prepare schema version data
      const dataset = await getDatasetFromJob(payload, job);
      const fieldStats = getFieldStats(job);

      // Determine if this is auto-approved or manual-approved
      const isAutoApproved = !job.schemaValidation?.requiresApproval;
      const approvedById = isAutoApproved ? null : getApprovedById(job.schemaValidation?.approvedBy);

      logger.info("Creating schema version", {
        importJobId,
        datasetId: dataset.id,
        isAutoApproved,
        approvedById,
      });

      // Create schema version
      const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
        dataset: dataset.id,
        schema: job.schema,
        fieldMetadata: fieldStats || {},
        fieldMappings: job.detectedFieldMappings,
        autoApproved: isAutoApproved,
        approvedBy: approvedById,
        importSources: [],
        req: context.req as PayloadRequest | undefined,
      });

      // Update job with schema version
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          datasetSchemaVersion: schemaVersion.id,
        },
      });

      logger.info("Schema version created successfully", {
        importJobId,
        schemaVersionId: schemaVersion.id,
      });

      // Complete CREATE_SCHEMA_VERSION stage
      await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.CREATE_SCHEMA_VERSION);

      // Transition to next stage
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.GEOCODE_BATCH,
        },
      });

      return { output: { schemaVersionId: schemaVersion.id } };
    } catch (error) {
      logError(error, "Failed to create schema version", { importJobId });

      // Update job to failed state
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errorLog: {
            error: error instanceof Error ? error.message : "Unknown error",
            context: "schema version creation",
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  },
};
