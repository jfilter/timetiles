/**
 * Project a scheduled-ingest job's final failure before dispatch onto the schedule's
 * lifecycle state. Retry decisions belong to Payload; dispatched runs settle via reconcileRun.
 *
 * @module
 * @category Jobs
 */
import { eq } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { logError } from "@/lib/logger";
import { buildResourceIdMatch } from "@/lib/services/payload-job-queries";
import { asSystem } from "@/lib/services/system-payload";
import { scheduled_ingests } from "@/payload-generated-schema";

import { updateScheduledIngestFailure } from "../url-fetch-job/scheduled-ingest-utils";

type ReconcileRequest = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

const recordLockedFailure = async (payload: Payload, id: number, req: ReconcileRequest): Promise<boolean> => {
  // Trigger claims update this same row. Keep it locked through the status write.
  const db = await getTransactionAwareDrizzle(payload, req);
  const rows = await db
    .select({ id: scheduled_ingests.id })
    .from(scheduled_ingests)
    .where(eq(scheduled_ingests.id, id))
    .for("update");
  if (rows.length === 0) return false;

  const current = await asSystem(payload).findByID({ collection: "scheduled-ingests", id, depth: 0, req });
  if (current.lastStatus !== "running" || !current.lastRun) return false;
  // Once this run dispatched its sheets, reconcileRun owns the bookkeeping.
  const dispatched = await asSystem(payload).count({
    collection: "ingest-runs",
    where: { scheduledIngest: { equals: current.id }, dispatchedAt: { greater_than_equal: current.lastRun } },
    req,
  });
  if (dispatched.totalDocs > 0) return false;

  const jobs = await asSystem(payload).find({
    collection: "payload-jobs",
    where: {
      and: [
        { workflowSlug: { equals: "scheduled-ingest" } },
        buildResourceIdMatch("input.scheduledIngestId", current.id),
        { createdAt: { greater_than_equal: current.lastRun } },
      ],
    },
    sort: "-id",
    limit: 1,
    depth: 0,
    req,
  });
  const latest = jobs.docs[0];
  if (!latest?.hasError || latest.processing === true || latest.completedAt != null) return false;

  const error = latest.error;
  // Payload uses hasError for cancellation too; it is not an exhausted retry budget.
  if (error && typeof error === "object" && "cancelled" in error && error.cancelled === true) return false;
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Scheduled ingest workflow failed";
  await updateScheduledIngestFailure(payload, current, new Error(message), { req });
  return true;
};

export const reconcileFailedScheduledIngests = async (payload: Payload): Promise<number> => {
  const running = await asSystem(payload).find({
    collection: "scheduled-ingests",
    where: { lastStatus: { equals: "running" } },
    limit: 0,
    pagination: false,
    depth: 0,
    select: {},
  });
  let reconciled = 0;

  for (const candidate of running.docs) {
    const req: ReconcileRequest = { payload, transactionID: undefined, context: {} };
    const ownsTransaction = await initTransaction(req);
    try {
      const changed = await recordLockedFailure(payload, candidate.id, req);
      if (ownsTransaction) await commitTransaction(req);
      if (changed) reconciled++;
    } catch (error) {
      if (ownsTransaction) await killTransaction(req);
      logError(error, "Failed to reconcile scheduled ingest job outcome", { scheduledIngestId: candidate.id });
    }
  }
  return reconciled;
};
