/**
 * Defines the Payload CMS collection configuration for Import Jobs.
 *
 * This collection is the heart of the data import pipeline. Each document represents a single,
 * discrete import job for a specific dataset (or a sheet within a file). It tracks the entire
 * lifecycle of the import process through a series of stages, from initial deduplication to
 * final event creation.
 *
 * Key responsibilities of this collection include:
 * - Managing the current processing `stage` of the import.
 * - Storing detailed results from each stage, such as duplicate analysis, schema detection, and validation.
 * - Tracking progress, errors, and final results.
 * - Orchestrating the pipeline by triggering the next job in the sequence via `afterChange` hooks.
 * - Enforcing valid stage transitions to maintain pipeline integrity.
 *
 * @module
 */
import type { CollectionConfig, Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { USAGE_TYPES } from "@/lib/constants/quota-constants";
import { logger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import { StageTransitionService } from "@/lib/services/stage-transition";
import type { ImportJob } from "@/payload-types";

import { createCommonConfig } from "./shared-fields";

// Helper functions for import job processing

const isJobCompleted = (doc: ImportJob): boolean => {
  return doc.stage === PROCESSING_STAGE.COMPLETED || doc.stage === PROCESSING_STAGE.FAILED;
};

const handleJobCompletion = async (payload: Payload, doc: ImportJob): Promise<void> => {
  // Extract import file ID, handling both relationship object and direct ID cases
  const importFileId = typeof doc.importFile === "object" ? doc.importFile.id : doc.importFile;

  // Check if all jobs for this import file are completed before marking file as completed
  const allJobs = await payload.find({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    where: {
      importFile: { equals: importFileId },
    },
  });

  const allCompleted = allJobs.docs.every(
    (job: ImportJob) => job.stage === PROCESSING_STAGE.COMPLETED || job.stage === PROCESSING_STAGE.FAILED
  );

  if (allCompleted) {
    // All jobs for this file are done, mark file as completed
    const hasFailures = allJobs.docs.some((job: ImportJob) => job.stage === PROCESSING_STAGE.FAILED);
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_FILES,
      id: importFileId,
      data: { status: hasFailures ? "failed" : "completed" },
    });

    logger.info("Updated import file status", {
      importFileId,
      status: hasFailures ? "failed" : "completed",
      totalJobs: allJobs.docs.length,
    });
  }
};

// Stage transition validation is now handled by StageTransitionService

const ImportJobs: CollectionConfig = {
  slug: "import-jobs",
  ...createCommonConfig({
    drafts: false,
    versions: true,
  }),
  admin: {
    useAsTitle: "id",
    defaultColumns: ["dataset", "stage", "progress", "createdAt"],
    group: "Import System",
    description: "Unified import processing pipeline",
  },
  access: {
    // Import jobs can be read by the import file owner or admins
    read: async ({ req, data }) => {
      const { user } = req;
      if (user?.role === "admin") return true;

      if (data?.importFile) {
        const importFileId = typeof data.importFile === "object" ? data.importFile.id : data.importFile;
        const importFile = await req.payload.findByID({
          collection: "import-files",
          id: importFileId,
        });

        if (user && importFile?.user) {
          const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;
          return user.id === userId;
        }
      }

      return false;
    },

    // Only authenticated users can create import jobs
    create: ({ req: { user } }) => Boolean(user),

    // Only import file owner or admins can update
    update: async ({ req, data }) => {
      const { user } = req;
      if (user?.role === "admin") return true;

      if (user && data?.importFile) {
        const importFileId = typeof data.importFile === "object" ? data.importFile.id : data.importFile;
        const importFile = await req.payload.findByID({
          collection: "import-files",
          id: importFileId,
        });

        if (importFile?.user) {
          const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;
          return user.id === userId;
        }
      }

      return false;
    },

    // Only admins can delete
    delete: ({ req: { user } }) => user?.role === "admin",

    // Only admins can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    // Basic Information
    {
      name: "importFile",
      type: "relationship",
      relationTo: "import-files",
      required: true,
      admin: {
        description: "Source file for this import job",
      },
    },
    {
      name: "dataset",
      type: "relationship",
      relationTo: "datasets",
      required: true,
      admin: {
        description: "Target dataset for imported data",
      },
    },
    {
      name: "sheetIndex",
      type: "number",
      admin: {
        description: "Sheet index for Excel files (0-based)",
        condition: (data) => data.sheetIndex !== undefined,
      },
    },

    // Processing Stage
    {
      name: "stage",
      type: "select",
      required: true,
      defaultValue: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      options: [
        { label: "Analyze Duplicates", value: PROCESSING_STAGE.ANALYZE_DUPLICATES },
        { label: "Detect Schema", value: PROCESSING_STAGE.DETECT_SCHEMA },
        { label: "Validate Schema", value: PROCESSING_STAGE.VALIDATE_SCHEMA },
        { label: "Await Approval", value: PROCESSING_STAGE.AWAIT_APPROVAL },
        { label: "Create Schema Version", value: PROCESSING_STAGE.CREATE_SCHEMA_VERSION },
        { label: "Geocode Batch", value: PROCESSING_STAGE.GEOCODE_BATCH },
        { label: "Create Events", value: PROCESSING_STAGE.CREATE_EVENTS },
        { label: "Completed", value: PROCESSING_STAGE.COMPLETED },
        { label: "Failed", value: PROCESSING_STAGE.FAILED },
      ],
      admin: {
        position: "sidebar",
        description: "Current processing stage",
      },
    },

    // Progress Tracking
    {
      name: "progress",
      type: "group",
      fields: [
        {
          name: "current",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Total rows/records processed so far",
          },
        },
        {
          name: "total",
          type: "number",
          admin: {
            description: "Total rows/records to process",
          },
        },
        {
          name: "batchNumber",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Current batch being processed",
          },
        },
      ],
    },

    // Schema Detection
    {
      name: "schema",
      type: "json",
      admin: {
        description: "Detected JSON Schema from data",
        condition: (data) => data.schema,
      },
    },
    {
      name: "schemaBuilderState",
      type: "json",
      admin: {
        description: "Progressive schema builder state for continuity across batches",
        condition: (data) => [PROCESSING_STAGE.DETECT_SCHEMA, PROCESSING_STAGE.VALIDATE_SCHEMA].includes(data.stage),
      },
    },

    // Schema Validation
    {
      name: "schemaValidation",
      type: "group",
      admin: {
        condition: (data) =>
          [
            PROCESSING_STAGE.DETECT_SCHEMA,
            PROCESSING_STAGE.VALIDATE_SCHEMA,
            PROCESSING_STAGE.AWAIT_APPROVAL,
            PROCESSING_STAGE.GEOCODE_BATCH,
            PROCESSING_STAGE.CREATE_EVENTS,
            PROCESSING_STAGE.COMPLETED,
          ].includes(data.stage),
      },
      fields: [
        {
          name: "isCompatible",
          type: "checkbox",
          admin: {
            description: "Whether schema is compatible with dataset schema",
          },
        },
        {
          name: "breakingChanges",
          type: "json",
          admin: {
            description: "List of breaking schema changes",
            condition: (data) => data.schemaValidation?.breakingChanges?.length > 0,
          },
        },
        {
          name: "newFields",
          type: "json",
          admin: {
            description: "New fields detected (auto-grow candidates)",
            condition: (data) => data.schemaValidation?.newFields?.length > 0,
          },
        },
        {
          name: "requiresApproval",
          type: "checkbox",
          admin: {
            description: "Whether manual approval is required",
          },
        },
        {
          name: "approvalReason",
          type: "text",
          admin: {
            description: "Reason why approval is required",
            condition: (data) => data.schemaValidation?.requiresApproval,
          },
        },
        {
          name: "approved",
          type: "checkbox",
          admin: {
            description: "Whether schema changes were approved",
            condition: (data) => data.schemaValidation?.requiresApproval,
          },
        },
        {
          name: "approvedBy",
          type: "relationship",
          relationTo: "users",
          admin: {
            description: "User who approved the schema",
            condition: (data) => data.schemaValidation?.approved,
          },
        },
        {
          name: "approvedAt",
          type: "date",
          admin: {
            description: "When schema was approved",
            condition: (data) => data.schemaValidation?.approved,
          },
        },
      ],
    },

    // Schema Version Reference
    {
      name: "datasetSchemaVersion",
      type: "relationship",
      relationTo: "dataset-schemas",
      admin: {
        description: "The schema version this import was validated against",
        condition: (data) => ["geocode-batch", "create-events", "completed"].includes(data.stage),
      },
    },

    // Duplicate Detection
    {
      name: "duplicates",
      type: "group",
      admin: {
        condition: (data) =>
          [
            PROCESSING_STAGE.DETECT_SCHEMA,
            PROCESSING_STAGE.VALIDATE_SCHEMA,
            PROCESSING_STAGE.AWAIT_APPROVAL,
            PROCESSING_STAGE.GEOCODE_BATCH,
            PROCESSING_STAGE.CREATE_EVENTS,
            PROCESSING_STAGE.COMPLETED,
          ].includes(data.stage),
      },
      fields: [
        {
          name: "strategy",
          type: "text",
          admin: {
            description: "Deduplication strategy used (external-id, computed-hash, etc.)",
          },
        },
        {
          name: "internal",
          type: "json",
          admin: {
            description: "Duplicates found within this import",
          },
        },
        {
          name: "external",
          type: "json",
          admin: {
            description: "Duplicates found with existing events",
          },
        },
        {
          name: "summary",
          type: "group",
          fields: [
            {
              name: "totalRows",
              type: "number",
              admin: {
                description: "Total rows analyzed",
              },
            },
            {
              name: "uniqueRows",
              type: "number",
              admin: {
                description: "Unique rows after deduplication",
              },
            },
            {
              name: "internalDuplicates",
              type: "number",
              admin: {
                description: "Duplicates within import",
              },
            },
            {
              name: "externalDuplicates",
              type: "number",
              admin: {
                description: "Duplicates with existing data",
              },
            },
          ],
        },
      ],
    },

    // Geocoding
    {
      name: "geocodingCandidates",
      type: "json",
      admin: {
        description: "Fields identified for geocoding",
        condition: (data) => data.geocodingCandidates,
      },
    },
    {
      name: "geocodingResults",
      type: "json",
      admin: {
        description: "Geocoding results by row number",
        condition: (data) => data.geocodingResults,
      },
    },
    {
      name: "geocodingProgress",
      type: "group",
      admin: {
        condition: (data) => data.stage === "geocode-batch",
      },
      fields: [
        {
          name: "current",
          type: "number",
          defaultValue: 0,
        },
        {
          name: "total",
          type: "number",
        },
      ],
    },

    // Results
    {
      name: "results",
      type: "json",
      admin: {
        description: "Processing results and statistics",
        condition: (data) => data.stage === "completed" || data.stage === "failed",
      },
    },

    // Errors
    {
      name: "errors",
      type: "array",
      admin: {
        description: "Processing errors by row",
        condition: (data) => data.errors?.length > 0,
      },
      fields: [
        {
          name: "row",
          type: "number",
          required: true,
        },
        {
          name: "error",
          type: "text",
          required: true,
        },
      ],
    },

    // Error Recovery Fields
    {
      name: "errorLog",
      type: "json",
      admin: {
        description: "Detailed error information and recovery attempts",
        condition: (data) => data.stage === "failed" || data.retryAttempts > 0,
      },
    },
    {
      name: "retryAttempts",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Number of retry attempts made",
      },
    },
    {
      name: "lastRetryAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "Timestamp of last retry attempt",
        condition: (data) => data.retryAttempts > 0,
      },
    },
    {
      name: "nextRetryAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "Scheduled time for next retry attempt",
        condition: (data) => data.stage === "failed" && data.retryAttempts > 0,
      },
    },
    {
      name: "lastSuccessfulStage",
      type: "select",
      options: [
        { label: "Analyze Duplicates", value: "analyze-duplicates" },
        { label: "Detect Schema", value: "detect-schema" },
        { label: "Validate Schema", value: "validate-schema" },
        { label: "Await Approval", value: "await-approval" },
        { label: "Geocode Batch", value: "geocode-batch" },
        { label: "Create Events", value: "create-events" },
      ],
      admin: {
        description: "Last stage completed successfully before failure",
        condition: (data) => data.stage === "failed",
      },
    },

    // Virtual Fields
    {
      name: "displayTitle",
      type: "text",
      virtual: true,
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          ({ data }) => {
            const datasetName = typeof data?.dataset === "object" ? data.dataset.name : "Unknown Dataset";
            const fileName = typeof data?.importFile === "object" ? data.importFile.filename : "Unknown File";
            const sheetInfo = data?.sheetIndex !== undefined ? ` (Sheet ${data.sheetIndex + 1})` : "";
            return `${datasetName} - ${fileName}${sheetInfo}`;
          },
        ],
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, req, originalDoc }) => {
        // Update the stage when approved is set to true
        if (
          operation === "update" &&
          data.stage === PROCESSING_STAGE.AWAIT_APPROVAL &&
          data.schemaValidation?.approved === true &&
          originalDoc?.schemaValidation?.approved !== true
        ) {
          const approvedBy = req.user?.id ?? 1;
          data.stage = PROCESSING_STAGE.CREATE_SCHEMA_VERSION;
          data.schemaValidation.approvedAt = new Date();
          data.schemaValidation.approvedBy = approvedBy;
          logger.info("Import job approved", {
            importJobId: data.id,
            approvedBy: approvedBy,
            stage: data.stage,
          });
        }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        // Track import job creation for quota
        if (operation === "create") {
          // Get the user who created this import job (from the import file)
          const importFileId = typeof doc.importFile === "object" ? doc.importFile.id : doc.importFile;
          const importFile = await req.payload.findByID({
            collection: COLLECTION_NAMES.IMPORT_FILES,
            id: importFileId,
          });

          if (importFile?.user) {
            const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;

            const quotaService = getQuotaService(req.payload);
            await quotaService.incrementUsage(userId, USAGE_TYPES.IMPORT_JOBS_TODAY, 1);

            logger.info("Import job creation tracked for quota", {
              userId,
              importJobId: doc.id,
            });
          }
        }
        // Handle initial job creation
        if (operation === "create") {
          await req.payload.jobs.queue({
            task: JOB_TYPES.ANALYZE_DUPLICATES,
            input: { importJobId: doc.id },
          });
          return doc;
        }

        // Handle stage transitions
        await StageTransitionService.processStageTransition(req.payload, doc, previousDoc);

        // Handle job completion status updates
        if (isJobCompleted(doc)) {
          await handleJobCompletion(req.payload, doc);
        }

        return doc;
      },
    ],
  },
};

export default ImportJobs;
