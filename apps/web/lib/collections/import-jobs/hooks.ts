/**
 * Lifecycle hooks for import jobs collection.
 *
 * @module
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { USAGE_TYPES } from "@/lib/constants/quota-constants";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getQuotaService } from "@/lib/services/quota-service";
import { StageTransitionService } from "@/lib/services/stage-transition";
import { extractRelationId } from "@/lib/utils/relation-id";
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
    logger.info("Import job approved", { importJobId: data.id, approvedBy: approvedBy, stage: data.stage });
  }
};

const validateImportFileOwnership = async (
  importFile: ImportJob["importFile"] | undefined,
  userId: number,
  req: PayloadRequest
): Promise<void> => {
  if (!importFile) return;

  const importFileId = extractRelationId(importFile);
  if (!importFileId) return;

  const file = await req.payload.findByID({ collection: "import-files", id: importFileId, overrideAccess: true });
  const ownerId = extractRelationId(file?.user);
  if (ownerId !== userId) {
    throw new Error("You can only create import jobs for your own import files");
  }
};

const validateDatasetCatalogAccess = async (
  dataset: ImportJob["dataset"] | undefined,
  userId: number,
  req: PayloadRequest
): Promise<void> => {
  if (!dataset) return;

  const datasetId = extractRelationId(dataset);
  if (!datasetId) return;

  const ds = await req.payload.findByID({ collection: "datasets", id: datasetId, overrideAccess: true });
  const catalogId = extractRelationId(ds?.catalog);
  if (!catalogId) return;

  const catalog = await req.payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true });
  const catalogOwnerId = extractRelationId(catalog?.createdBy);
  const isPublicCatalog = catalog?.isPublic ?? false;
  if (catalogOwnerId !== userId && !isPublicCatalog) {
    throw new Error("You can only create import jobs for datasets in your own or public catalogs");
  }
};

/**
 * Validates that a non-privileged user owns the referenced importFile and
 * has access to the target dataset's catalog when creating an import job.
 */
const validateCreateOwnership = async (data: Partial<ImportJob>, req: PayloadRequest): Promise<void> => {
  const user = req.user as { id: number; role?: string } | undefined;
  if (!user) return;

  const isPrivileged = user.role === "admin" || user.role === "editor";
  if (isPrivileged) return;

  await validateImportFileOwnership(data.importFile, user.id, req);
  await validateDatasetCatalogAccess(data.dataset, user.id, req);
};

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  async ({ data, operation, req, originalDoc }) => {
    // Validate ownership on create
    if (operation === "create") {
      await validateCreateOwnership(data, req);
    }

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

const isTerminalStageOverride = (fromStage: string, toStage: string): boolean =>
  (fromStage === PROCESSING_STAGE.COMPLETED && toStage !== PROCESSING_STAGE.COMPLETED) ||
  (fromStage === PROCESSING_STAGE.FAILED && toStage !== PROCESSING_STAGE.FAILED);

const auditAdminStageOverride = async (req: PayloadRequest, doc: ImportJob, previousDoc: ImportJob): Promise<void> => {
  if (req.user?.role !== "admin") return;

  const fromStage = previousDoc.stage;
  const toStage = doc.stage;
  if (!isTerminalStageOverride(fromStage, toStage)) return;

  await auditLog(req.payload, {
    action: AUDIT_ACTIONS.IMPORT_JOB_STAGE_OVERRIDE,
    userId: req.user.id,
    userEmail: req.user.email,
    details: {
      importJobId: doc.id,
      fromStage,
      toStage,
      overrideType: fromStage === PROCESSING_STAGE.COMPLETED ? "completed_state_reset" : "failed_recovery",
    },
  });
};

const trackImportJobQuota = async (req: PayloadRequest, doc: ImportJob): Promise<void> => {
  const importFileId = extractRelationId(doc.importFile)!;
  const importFile = await req.payload.findByID({ collection: COLLECTION_NAMES.IMPORT_FILES, id: importFileId });

  if (!importFile?.user) return;

  const userId = extractRelationId(importFile.user)!;
  const quotaService = getQuotaService(req.payload);
  await quotaService.incrementUsage(userId, USAGE_TYPES.IMPORT_JOBS_TODAY, 1, req);
  logger.info("Import job creation tracked for quota", { userId, importJobId: doc.id });
};

const handleFailedTransition = async (req: PayloadRequest, doc: ImportJob, error: string): Promise<void> => {
  logger.error("Stage transition failed, marking job as FAILED", { importJobId: doc.id, error });
  await req.payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: doc.id,
    data: {
      stage: PROCESSING_STAGE.FAILED,
      errorLog: { error, context: "stage transition", timestamp: new Date().toISOString() },
    },
  });
};

export const afterChangeHooks: CollectionAfterChangeHook[] = [
  async ({ doc, previousDoc, req, operation }) => {
    if (req.context?.skipStageTransition) return doc;

    if (operation === "update" && previousDoc) {
      await auditAdminStageOverride(req, doc, previousDoc);
    }

    if (operation === "create") {
      await trackImportJobQuota(req, doc);
      await req.payload.jobs.queue({ task: JOB_TYPES.ANALYZE_DUPLICATES, input: { importJobId: doc.id } });
      return doc;
    }

    const transitionResult = await StageTransitionService.processStageTransition(req.payload, doc, previousDoc);
    if (!transitionResult.success && transitionResult.error) {
      await handleFailedTransition(req, doc, transitionResult.error);
    }

    if (isJobCompleted(doc)) {
      await handleJobCompletion(req.payload, doc, req);
    }

    return doc;
  },
];
