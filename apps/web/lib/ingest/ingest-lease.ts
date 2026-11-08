/**
 * The lease of a running ingest task (ADR 0043).
 *
 * A worker running an ingest workflow touches its Payload job every minute. The
 * job holds a live lease while it is `processing` and was touched within
 * `ingest.leaseMinutes` of the app config.
 *
 * @module
 * @category Ingest
 */
import { and, eq, inArray, isNull, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";

import { ValidationError } from "@/lib/api/errors";
import { getAppConfig } from "@/lib/config/app-config";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { payload_jobs } from "@/payload-generated-schema";

/** Milliseconds without a heartbeat after which a running ingest job counts as abandoned. */
export const getIngestLeaseMs = (): number => getAppConfig().ingest.leaseMinutes * 60_000;

/**
 * Refuse to delete ingest jobs whose task is running: it would keep writing and overwriting events.
 * Locks their unfinished children, so a worker cannot claim one until the deletion commits.
 */
export const assertNoLiveIngestTask = async (
  payload: Payload,
  ingestJobIds: Array<number | string>,
  req: Pick<PayloadRequest, "transactionID">
): Promise<void> => {
  if (ingestJobIds.length === 0) return;
  const db = await getTransactionAwareDrizzle(payload, req);
  const cutoff = new Date(Date.now() - getIngestLeaseMs()).toISOString();
  const children: Array<Pick<typeof payload_jobs.$inferSelect, "processing" | "updatedAt">> = await db
    .select({ processing: payload_jobs.processing, updatedAt: payload_jobs.updatedAt })
    .from(payload_jobs)
    .where(
      and(
        eq(payload_jobs.workflowSlug, "ingest-process"),
        isNull(payload_jobs.completedAt),
        inArray(sql`${payload_jobs.input} ->> 'ingestJobId'`, ingestJobIds.map(String))
      )
    )
    .for("update");
  if (children.some((child) => child.processing === true && Date.parse(child.updatedAt) >= Date.parse(cutoff))) {
    throw new ValidationError("An import of this data is still running. Delete it once the import has finished.");
  }
};
