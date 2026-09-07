/**
 * IngestFile status update helpers for workflow completion.
 * Called from workflow handlers after all sheets are processed.
 * Replaces the hook-based handleJobCompletion which had transaction issues.
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { updateIngestFileStatusForJob } from "@/lib/ingest/ingest-file-status";

import type { SheetInfo } from "../types/task-outputs";

// Status derivation lives in lib/ingest/ingest-file-status.ts (domain layer) so
// the ingest-jobs approval hook can also call it in-transaction.
export { updateIngestFileStatusForJob };

export const updateIngestFileStatus = async (payload: Payload, sheets: SheetInfo[]): Promise<void> => {
  const firstSheet = sheets[0];
  if (firstSheet) await updateIngestFileStatusForJob(payload, firstSheet.ingestJobId);
};
