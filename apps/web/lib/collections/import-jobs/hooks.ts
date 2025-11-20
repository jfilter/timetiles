/**
 * Lifecycle hooks for import jobs collection.
 *
 * @module
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { USAGE_TYPES } from "@/lib/constants/quota-constants";
import { logger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import { StageTransitionService } from "@/lib/services/stage-transition";

import { handleJobCompletion, isJobCompleted } from "./helpers";

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
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
