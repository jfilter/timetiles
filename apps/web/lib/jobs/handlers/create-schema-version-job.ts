/**
 * Job handler for creating schema versions for both auto-approved and manually-approved schemas.
 *
 * This job is queued after schema validation (for auto-approved changes) or after manual approval
 * to create the schema version in a separate transaction, avoiding circular dependencies and deadlocks.
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { readInterpretationPlan } from "@/lib/ingest/interpret";
import { planToSchemaFieldMappings } from "@/lib/ingest/plan-builder";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { SchemaVersioningService } from "@/lib/ingest/schema-versioning";
import { createJobLogger, logError } from "@/lib/logger";
import { compareSchemas } from "@/lib/services/schema-builder/schema-comparison";
import { asSystem } from "@/lib/services/system-payload";
import { getFieldStats } from "@/lib/types/schema-detection";

import type { CreateSchemaVersionJobInput } from "../types/job-inputs";
import { buildFieldTypes } from "../utils/event-creation-helpers";
import type { JobHandlerContext } from "../utils/job-context";
import {
  createStandardOnFail,
  getUniqueRowsForQuota,
  loadDataset,
  loadIngestJob,
  setJobStage,
} from "../utils/resource-loading";

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

/** Normalize a stored/detected schema to a plain object for comparison. */
const asSchemaObject = (raw: unknown): Record<string, unknown> =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/**
 * Return the dataset's latest schema version when the job's detected schema is
 * identical to it (per the same comparison validate-schema uses), or null when
 * a new version genuinely needs to be created.
 */
const findReusableSchemaVersion = async (
  payload: Payload,
  datasetId: number | string,
  jobSchema: unknown
): Promise<{ id: number; versionNumber: number } | null> => {
  const latest = await payload.find({
    collection: COLLECTION_NAMES.DATASET_SCHEMAS,
    where: { dataset: { equals: datasetId } },
    sort: "-versionNumber",
    limit: 1,
    overrideAccess: true,
  });

  const latestVersion = latest.docs[0];
  if (!latestVersion || typeof latestVersion.versionNumber !== "number") return null;

  const comparison = compareSchemas(asSchemaObject(latestVersion.schema), asSchemaObject(jobSchema));
  return comparison.changes.length === 0 ? { id: latestVersion.id, versionNumber: latestVersion.versionNumber } : null;
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
  onFail: createStandardOnFail("create-schema-version"),
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
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_SCHEMA_VERSION);

      // Start CREATE_SCHEMA_VERSION stage
      const uniqueRows = getUniqueRowsForQuota(job);
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

      // Reuse the latest version when the schema is unchanged — otherwise
      // every successful import of a stable feed (e.g. an hourly scheduled
      // URL) appends an identical dataset-schemas row, growing version
      // history unboundedly and making it useless.
      const existingVersion = await findReusableSchemaVersion(payload, dataset.id, job.schema);
      let schemaVersion: { id: number; versionNumber: number };
      if (existingVersion) {
        logger.info("Schema unchanged — linking existing schema version", {
          ingestJobId,
          schemaVersionId: existingVersion.id,
          versionNumber: existingVersion.versionNumber,
        });
        schemaVersion = existingVersion;
      } else {
        // Determine if this is auto-approved or manual-approved
        const isAutoApproved = !job.schemaValidation?.requiresApproval;
        const approvedById = isAutoApproved ? null : getApprovedById(job.schemaValidation?.approvedBy);

        logger.info("Creating schema version", { ingestJobId, datasetId: dataset.id, isAutoApproved, approvedById });

        schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
          dataset: dataset.id,
          schema: job.schema,
          fieldMetadata: fieldStats || {},
          fieldMappings: planToSchemaFieldMappings(readInterpretationPlan(job)),
          autoApproved: isAutoApproved,
          approvedBy: approvedById,
          ingestSources: [],
          req: context.req as PayloadRequest | undefined,
        });
      }

      // Update job with schema version
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { datasetSchemaVersion: schemaVersion.id },
      });

      logger.info("Schema version resolved", { ingestJobId, schemaVersionId: schemaVersion.id });

      // Sync fieldMetadata to dataset so categorical filter UI can read it.
      // Without this, dataset.fieldMetadata stays null and enum filters never appear.
      if (fieldStats && Object.keys(fieldStats).length > 0) {
        await asSystem(payload).update({
          collection: COLLECTION_NAMES.DATASETS,
          id: dataset.id,
          data: { fieldMetadata: fieldStats, fieldTypes: buildFieldTypes(fieldStats) },
        });
      }

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
