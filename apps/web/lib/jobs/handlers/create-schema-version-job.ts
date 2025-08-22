/**
 * Job handler for creating schema versions after approval.
 *
 * This job is queued after schema approval to create the schema version
 * in a separate transaction, avoiding circular dependencies and deadlocks.
 *
 * @module
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError } from "@/lib/logger";
import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import { getFieldStats } from "@/lib/types/schema-detection";

import type { CreateSchemaVersionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

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

      // Skip if schema version already exists
      if (job.datasetSchemaVersion) {
        logger.info("Schema version already exists, skipping", {
          importJobId,
          schemaVersionId: job.datasetSchemaVersion,
        });
        return { output: { skipped: true } };
      }

      // Skip if not approved
      if (!job.schemaValidation?.approved) {
        logger.warn("Schema not approved, skipping version creation", { importJobId });
        return { output: { skipped: true } };
      }

      // Get dataset
      const dataset =
        typeof job.dataset === "object"
          ? job.dataset
          : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: job.dataset });

      if (!dataset) {
        throw new Error("Dataset not found");
      }

      // Create schema version
      const fieldStats = getFieldStats(job);
      const approvedBy = job.schemaValidation?.approvedBy;
      const approvedById = typeof approvedBy === "object" && approvedBy ? approvedBy.id : approvedBy;

      logger.info("Creating schema version", {
        importJobId,
        datasetId: dataset.id,
        approvedById,
      });

      // Create schema version
      const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
        dataset: dataset.id,
        schema: job.schema,
        fieldMetadata: fieldStats || {},
        autoApproved: false,
        approvedBy: approvedById,
        importSources: [],
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
