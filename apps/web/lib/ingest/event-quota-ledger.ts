/**
 * Event quota ledger: the `TOTAL_EVENTS` charge of each IngestJob generation.
 *
 * create-events inserts events through raw SQL, so it charges the usage itself. A
 * `quota-reservations` row holds the amount currently charged for one
 * `(ingestJob, generation)`, and every change of the usage happens in the same
 * transaction as the change of that row. A retry or a crash between steps therefore
 * finds the charge it already made instead of charging again. See ADR 0043.
 *
 * @module
 * @category Ingest
 */
import { and, count, eq, gte, lt } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { createQuotaService } from "@/lib/services/quota-service";
import { events, quota_reservations } from "@/payload-generated-schema";
import type { IngestJob, User } from "@/payload-types";

type Tx = Awaited<ReturnType<typeof getTransactionAwareDrizzle>>;

const withTransaction = async <T>(payload: Payload, work: (db: Tx, req: PayloadRequest) => Promise<T>): Promise<T> => {
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("The event quota ledger requires a database transaction");
  try {
    const result = await work(await getTransactionAwareDrizzle(payload, req), req);
    await commitTransaction(req);
    return result;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/** Release and delete the job's charges, or only those of generations below `belowGeneration`. */
const releaseRows = async (
  payload: Payload,
  db: Tx,
  req: PayloadRequest,
  ingestJobId: number,
  belowGeneration?: number
): Promise<number> => {
  const ofJob = eq(quota_reservations.ingestJob, ingestJobId);
  const rows = await db
    .delete(quota_reservations)
    .where(belowGeneration === undefined ? ofJob : and(ofJob, lt(quota_reservations.generation, belowGeneration)))
    .returning({ user: quota_reservations.user, amount: quota_reservations.amount });
  const quotaService = createQuotaService(payload);
  let released = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (row.user == null || amount <= 0) continue;
    await quotaService.decrementUsage(row.user, "TOTAL_EVENTS", amount, req);
    released += amount;
  }
  return released;
};

/**
 * Lock this generation's row, creating it empty if needed. A row charged to another
 * user (the file changed owner) is refunded to that user and taken over by `user`.
 */
const lockRowFor = async (
  payload: Payload,
  db: Tx,
  req: PayloadRequest,
  { ingestJobId, generation, user }: { ingestJobId: number; generation: number; user: User }
) => {
  const userId = Number(user.id);
  await db
    .insert(quota_reservations)
    .values({ ingestJob: ingestJobId, generation, user: userId, amount: 0 })
    .onConflictDoNothing({ target: [quota_reservations.ingestJob, quota_reservations.generation] });
  const [row] = await db
    .select({ id: quota_reservations.id, user: quota_reservations.user, amount: quota_reservations.amount })
    .from(quota_reservations)
    .where(and(eq(quota_reservations.ingestJob, ingestJobId), eq(quota_reservations.generation, generation)))
    .for("update");
  if (!row) throw new Error(`Quota reservation for ingest job ${ingestJobId} could not be created`);
  let amount = Number(row.amount);
  if (row.user !== userId) {
    if (row.user != null && amount > 0) {
      await createQuotaService(payload).decrementUsage(row.user, "TOTAL_EVENTS", amount, req);
    }
    await db.update(quota_reservations).set({ user: userId, amount: 0 }).where(eq(quota_reservations.id, row.id));
    amount = 0;
  }
  return { id: row.id, amount };
};

/**
 * Charge `amount` new events for this generation before they are inserted.
 *
 * Releases the charges of older generations of the job first, whose events the
 * caller has already removed. A retry of the same generation keeps its charge and
 * pays only the difference. Throws `QuotaExceededError` and records nothing when
 * the difference exceeds the limit.
 */
export const reserveEventQuota = async (
  payload: Payload,
  { ingestJobId, generation, user, amount }: { ingestJobId: number; generation: number; user: User; amount: number }
): Promise<void> =>
  withTransaction(payload, async (db, req) => {
    await releaseRows(payload, db, req, ingestJobId, generation);
    const row = await lockRowFor(payload, db, req, { ingestJobId, generation, user });

    const quotaService = createQuotaService(payload);
    const delta = amount - row.amount;
    if (delta > 0) await quotaService.checkAndIncrementUsage(user, "TOTAL_EVENTS", delta, req);
    else if (delta < 0) await quotaService.decrementUsage(user.id, "TOTAL_EVENTS", -delta, req);
    await db.update(quota_reservations).set({ amount, settled: false }).where(eq(quota_reservations.id, row.id));
  });

/**
 * Convert this generation's charge to the events it actually created.
 *
 * The events are already committed, so a top-up beyond the limit is charged anyway.
 */
export const settleEventQuota = async (
  payload: Payload,
  { ingestJobId, generation, user, actual }: { ingestJobId: number; generation: number; user: User; actual: number }
): Promise<void> =>
  withTransaction(payload, async (db, req) => {
    const row = await lockRowFor(payload, db, req, { ingestJobId, generation, user });

    const quotaService = createQuotaService(payload);
    const delta = actual - row.amount;
    if (delta > 0) await quotaService.incrementUsage(user.id, "TOTAL_EVENTS", delta, req);
    else if (delta < 0) await quotaService.decrementUsage(user.id, "TOTAL_EVENTS", -delta, req);
    await db.update(quota_reservations).set({ amount: actual, settled: true }).where(eq(quota_reservations.id, row.id));
  });

/**
 * Release every charge of the job. Call it only after the events those charges
 * paid for were rolled back. Returns the released amount.
 */
export const releaseEventQuota = async (payload: Payload, ingestJobId: number): Promise<number> =>
  withTransaction(payload, (db, req) => releaseRows(payload, db, req, ingestJobId));

/**
 * Before IngestJobs are deleted: settled charges stay, since `TOTAL_EVENTS` is a lifetime
 * count. An unsettled reservation keeps the charge for its surviving inserts. Uses `req`'s transaction.
 */
export const settleDeletedJobsQuota = async (
  payload: Payload,
  jobs: Array<Pick<IngestJob, "id" | "createdAt">>,
  req: Pick<PayloadRequest, "transactionID">
): Promise<void> => {
  const db = await getTransactionAwareDrizzle(payload, req);
  const quotaService = createQuotaService(payload);
  for (const job of jobs) {
    const ingestJobId = Number(job.id);
    const rows: Array<Pick<typeof quota_reservations.$inferSelect, "user" | "amount" | "settled" | "generation">> =
      await db
        .delete(quota_reservations)
        .where(eq(quota_reservations.ingestJob, ingestJobId))
        .returning({
          user: quota_reservations.user,
          amount: quota_reservations.amount,
          settled: quota_reservations.settled,
          generation: quota_reservations.generation,
        });
    const reservations = rows.filter((row) => !row.settled && Number(row.amount) > 0);
    if (reservations.length === 0) continue;
    // Inserts carry a `createdAt` after the job's; events it updated in place were charged before.
    const [surviving] = await db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.ingestJob, ingestJobId), gte(events.createdAt, job.createdAt)));
    let unclaimed = Number(surviving?.value ?? 0);
    for (const row of reservations.toSorted((a, b) => Number(b.generation) - Number(a.generation))) {
      const kept = Math.min(unclaimed, Number(row.amount));
      unclaimed -= kept;
      if (row.user != null && Number(row.amount) > kept) {
        await quotaService.decrementUsage(row.user, "TOTAL_EVENTS", Number(row.amount) - kept, req);
      }
    }
  }
};
