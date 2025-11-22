/**
 * Lifecycle hooks for import jobs collection.
 *
 * @module
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { USAGE_TYPES } from "@/lib/constants/quota-constants";
import { logger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import { StageTransitionService } from "@/lib/services/stage-transition";
import type { ImportJob } from "@/payload-types";

import { handleJobCompletion, isJobCompleted } from "./helpers";

/**
 * Validates recovery stages for FAILED jobs.
 */
const isValidRecoveryStage = (stage: string): boolean =>
  stage === PROCESSING_STAGE.ANALYZE_DUPLICATES ||
  stage === PROCESSING_STAGE.DETECT_SCHEMA ||
  stage === PROCESSING_STAGE.VALIDATE_SCHEMA ||
  stage === PROCESSING_STAGE.GEOCODE_BATCH;

/**
 * Enforces terminal state for COMPLETED jobs.
 */
const enforceCompletedTerminalState = (
  fromStage: string,
  toStage: string,
  req: PayloadRequest,
  originalDoc: ImportJob
): void => {
  if (fromStage === PROCESSING_STAGE.COMPLETED && toStage !== PROCESSING_STAGE.COMPLETED) {
    // Allow admins to override with explicit warning
    if (req.user?.role === "admin") {
      logger.warn("Admin manually changed COMPLETED import job stage", {
        importJobId: originalDoc.id,
        fromStage,
        toStage,
        userId: req.user.id,
        userEmail: req.user.email,
      });
    } else {
      throw new Error(
        `Cannot modify completed import job. Import has finished successfully and cannot be restarted. ` +
          `Stage transition from '${fromStage}' to '${toStage}' is not allowed.`
      );
    }
  }
};

/**
 * Validates and logs FAILED job recovery transitions.
 */
const validateFailedRecovery = (
  fromStage: string,
  toStage: string,
  req: PayloadRequest,
  originalDoc: ImportJob
): void => {
  if (fromStage === PROCESSING_STAGE.FAILED && toStage !== PROCESSING_STAGE.FAILED) {
    if (!isValidRecoveryStage(toStage)) {
      throw new Error(
        `Invalid recovery stage '${toStage}' for failed import job. ` +
          `Failed jobs can only be retried from specific stages via the retry mechanism.`
      );
    }

    // Log recovery attempts (both automatic and manual)
    logger.info("Failed import job recovery initiated", {
      importJobId: originalDoc.id,
      fromStage,
      toStage,
      userId: req.user?.id,
      isAutomatic: !req.user, // No user means automated retry
    });
  }
};

/**
 * Handles schema approval workflow.
 */
const handleSchemaApproval = (
  data: Partial<ImportJob>,
  operation: string,
  req: PayloadRequest,
  originalDoc?: ImportJob
): void => {
  const isApprovalUpdate =
    operation === "update" &&
    data.stage === PROCESSING_STAGE.AWAIT_APPROVAL &&
    data.schemaValidation?.approved === true &&
    originalDoc?.schemaValidation?.approved !== true;

  if (isApprovalUpdate && data.schemaValidation) {
    if (!req.user) {
      throw new Error("Authentication required to approve schema changes");
    }
    const approvedBy = req.user.id;
    data.stage = PROCESSING_STAGE.CREATE_SCHEMA_VERSION;
    data.schemaValidation.approvedAt = new Date().toISOString();
    data.schemaValidation.approvedBy = approvedBy;
    logger.info("Import job approved", {
      importJobId: data.id,
      approvedBy: approvedBy,
      stage: data.stage,
    });
  }
};

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  ({ data, operation, req, originalDoc }) => {
    // Enforce terminal state for COMPLETED jobs
    if (operation === "update" && originalDoc) {
      const fromStage = originalDoc.stage;
      const toStage = data.stage;

      enforceCompletedTerminalState(fromStage, toStage, req, originalDoc);
      validateFailedRecovery(fromStage, toStage, req, originalDoc);
    }

    // Handle schema approval workflow
    handleSchemaApproval(data, operation, req, originalDoc);
  },
];

export const afterChangeHooks: CollectionAfterChangeHook[] = [
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
        await quotaService.incrementUsage(userId, USAGE_TYPES.IMPORT_JOBS_TODAY, 1, req);

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
      await handleJobCompletion(req.payload, doc, req);
    }

    return doc;
  },
];
