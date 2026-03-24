/**
 * Helpers for queueing background jobs from API routes.
 *
 * @module
 * @category API
 */
import type { Payload, Where } from "payload";

import { logError } from "@/lib/logger";

interface RollbackByID {
  collection: Parameters<Payload["update"]>[0]["collection"];
  id: number;
  data: Record<string, unknown>;
  where?: never;
}

interface RollbackByWhere {
  collection: Parameters<Payload["update"]>[0]["collection"];
  where: Where;
  data: Record<string, unknown>;
  id?: never;
}

type RollbackSpec = RollbackByID | RollbackByWhere;

const getTaskName = (job: Parameters<Payload["jobs"]["queue"]>[0]): string => {
  if ("task" in job && job.task) return String(job.task);
  if ("workflow" in job && job.workflow) return String(job.workflow);
  return "unknown";
};

/**
 * Queue a background job and revert resource status on queue failure.
 *
 * Use this when a resource has been atomically claimed (marked as running/pending)
 * and a job needs to be queued. If queueing fails, the resource status is reverted
 * so it doesn't get stuck.
 *
 * @throws Re-throws the queue error after rollback completes
 */
export const queueJobWithRollback = async (
  payload: Payload,
  job: Parameters<Payload["jobs"]["queue"]>[0],
  rollback: RollbackSpec,
  context?: string
): Promise<void> => {
  try {
    await payload.jobs.queue(job);
  } catch (error) {
    logError(error, context ?? `Failed to queue ${getTaskName(job)} job, reverting status`);
    if (rollback.id != null) {
      await payload.update({
        collection: rollback.collection,
        id: rollback.id,
        data: rollback.data,
        overrideAccess: true,
      });
    } else {
      await payload.update({
        collection: rollback.collection,
        where: rollback.where,
        data: rollback.data,
        overrideAccess: true,
      });
    }
    throw error;
  }
};
