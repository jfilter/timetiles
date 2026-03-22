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
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { getResumePointForReason, REVIEW_REASONS } from "@/lib/jobs/workflows/review-checks";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import type { IngestJob } from "@/payload-types";

import { getIngestFilePath } from "../../jobs/utils/upload-path";

/**
 * Enforces terminal state for COMPLETED jobs.
 */
const enforceCompletedTerminalState = (
  fromStage: string,
  toStage: string,
  req: PayloadRequest,
  originalDoc: IngestJob
): void => {
  if (fromStage === PROCESSING_STAGE.COMPLETED && toStage !== PROCESSING_STAGE.COMPLETED) {
    // Allow admins to override with explicit warning
    if (req.user?.role === "admin") {
      logger.warn("Admin manually changed COMPLETED import job stage", {
        ingestJobId: originalDoc.id,
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
 * Handles schema approval workflow.
 */
const handleSchemaApproval = (
  data: Partial<IngestJob>,
  operation: string,
  req: PayloadRequest,
  originalDoc?: IngestJob
): void => {
  const isApprovalUpdate =
    operation === "update" &&
    data.stage === PROCESSING_STAGE.NEEDS_REVIEW &&
    data.schemaValidation?.approved === true &&
    originalDoc?.schemaValidation?.approved !== true;

  if (isApprovalUpdate && data.schemaValidation) {
    if (!req.user) {
      throw new Error("Authentication required to approve schema changes");
    }
    // Only set approval metadata — the afterChange hook will queue ingest-process workflow
    data.schemaValidation.approvedAt = new Date().toISOString();
    data.schemaValidation.approvedBy = req.user.id;
    logger.info("Ingest job approved", { ingestJobId: data.id, approvedBy: req.user.id });
  }
};

const validateIngestFileOwnership = async (
  ingestFile: IngestJob["ingestFile"] | undefined,
  userId: number,
  req: PayloadRequest
): Promise<void> => {
  if (!ingestFile) return;

  const ingestFileId = extractRelationId(ingestFile);
  if (!ingestFileId) return;

  const file = await req.payload.findByID({ collection: "ingest-files", id: ingestFileId, overrideAccess: true });
  const ownerId = extractRelationId(file?.user);
  if (ownerId !== userId) {
    throw new Error("You can only create ingest jobs for your own ingest files");
  }
};

const validateDatasetCatalogAccess = async (
  dataset: IngestJob["dataset"] | undefined,
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
 * Validates that a non-privileged user owns the referenced ingestFile and
 * has access to the target dataset's catalog when creating an ingest job.
 */
const validateCreateOwnership = async (data: Partial<IngestJob>, req: PayloadRequest): Promise<void> => {
  const user = req.user as { id: number; role?: string } | undefined;
  if (!user) return;

  if (isPrivileged(user)) return;

  await validateIngestFileOwnership(data.ingestFile, user.id, req);
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
    }

    // Handle schema approval workflow
    handleSchemaApproval(data, operation, req, originalDoc);
  },
];

const isTerminalStageOverride = (fromStage: string, toStage: string): boolean =>
  (fromStage === PROCESSING_STAGE.COMPLETED && toStage !== PROCESSING_STAGE.COMPLETED) ||
  (fromStage === PROCESSING_STAGE.FAILED && toStage !== PROCESSING_STAGE.FAILED);

const auditAdminStageOverride = async (req: PayloadRequest, doc: IngestJob, previousDoc: IngestJob): Promise<void> => {
  if (req.user?.role !== "admin") return;

  const fromStage = previousDoc.stage;
  const toStage = doc.stage;
  if (!isTerminalStageOverride(fromStage, toStage)) return;

  await auditLog(req.payload, {
    action: AUDIT_ACTIONS.IMPORT_JOB_STAGE_OVERRIDE,
    userId: req.user.id,
    userEmail: req.user.email,
    details: {
      ingestJobId: doc.id,
      fromStage,
      toStage,
      overrideType: fromStage === PROCESSING_STAGE.COMPLETED ? "completed_state_reset" : "failed_recovery",
    },
  });
};

const trackIngestJobQuota = async (req: PayloadRequest, doc: IngestJob): Promise<void> => {
  const ingestFileId = requireRelationId(doc.ingestFile, "ingestJob.ingestFile");
  const ingestFile = await req.payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId });

  if (!ingestFile?.user) return;

  const userId = requireRelationId(ingestFile.user, "ingestFile.user");
  const quotaService = createQuotaService(req.payload);
  await quotaService.incrementUsage(userId, "IMPORT_JOBS_PER_DAY", 1, req);
  logger.info("Ingest job creation tracked for quota", { userId, ingestJobId: doc.id });
};

export const afterChangeHooks: CollectionAfterChangeHook[] = [
  async ({ doc, previousDoc, req, operation }) => {
    if (operation === "update" && previousDoc) {
      await auditAdminStageOverride(req, doc, previousDoc);
    }

    if (operation === "create") {
      await trackIngestJobQuota(req, doc);
      // No longer queue jobs here — workflow handles orchestration
    }

    // Queue ingest-process workflow when NEEDS_REVIEW is approved
    if (
      operation === "update" &&
      previousDoc?.stage === PROCESSING_STAGE.NEEDS_REVIEW &&
      doc.schemaValidation?.approved === true &&
      previousDoc?.schemaValidation?.approved !== true
    ) {
      // Quota exceeded requires admin approval
      if (doc.reviewReason === REVIEW_REASONS.QUOTA_EXCEEDED && req.user?.role !== "admin") {
        throw new Error("Only admins can approve quota-exceeded imports. Please contact us to increase your limit.");
      }

      const resumeFrom = getResumePointForReason(doc.reviewReason);
      const input = { ingestJobId: String(doc.id), resumeFrom };
      await req.payload.jobs.queue({ workflow: "ingest-process", input });
    }

    return doc;
  },
];

export const ingestJobAfterDeleteHook: CollectionAfterDeleteHook = ({ doc }) => {
  if (!doc?.ingestFile) return;
  try {
    const filename = typeof doc.ingestFile === "object" ? doc.ingestFile.filename : null;
    if (filename) {
      const filePath = getIngestFilePath(filename);
      cleanupSidecarFiles(filePath, doc.sheetIndex ?? 0);
    }
  } catch {
    // Best-effort cleanup
  }
};
