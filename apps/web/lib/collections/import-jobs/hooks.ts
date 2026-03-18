/**
 * Lifecycle hooks for import jobs collection.
 *
 * @module
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
} from "payload";

import { validateCatalogOwnership } from "@/lib/collections/catalog-ownership";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { isRecoveryStage } from "@/lib/constants/stage-graph";
import { cleanupSidecarFiles } from "@/lib/import/file-readers";
import { StageTransitionService } from "@/lib/import/stage-transition";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ImportJob } from "@/payload-types";

import { getImportFilePath } from "../../jobs/utils/upload-path";
import { handleJobCompletion, isJobCompleted } from "./helpers";

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
    if (!isRecoveryStage(toStage)) {
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
  const catalogRef = extractRelationId(ds?.catalog);
  if (!catalogRef) return;

  await validateCatalogOwnership(req.payload, catalogRef, { id: userId });
};

/**
 * Validates that a non-privileged user owns the referenced importFile and
 * has access to the target dataset's catalog when creating an import job.
 */
const validateCreateOwnership = async (data: Partial<ImportJob>, req: PayloadRequest): Promise<void> => {
  const user = req.user as { id: number; role?: string } | undefined;
  if (!user) return;

  if (isPrivileged(user)) return;

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
  const quotaService = createQuotaService(req.payload);
  await quotaService.incrementUsage(userId, "IMPORT_JOBS_PER_DAY", 1, req);
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

export const importJobAfterDeleteHook: CollectionAfterDeleteHook = ({ doc }) => {
  if (!doc?.importFile) return;
  try {
    const filename = typeof doc.importFile === "object" ? doc.importFile.filename : null;
    if (filename) {
      const filePath = getImportFilePath(filename);
      cleanupSidecarFiles(filePath, doc.sheetIndex ?? 0);
    }
  } catch {
    // Best-effort cleanup
  }
};
