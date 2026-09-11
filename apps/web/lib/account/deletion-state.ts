/**
 * Serialized account deletion state changes.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

import { ValidationError } from "@/lib/api/errors";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import type { User } from "@/payload-types";

export type DeletionRequest = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

/** Read current state under the lock shared by scheduling, execution and cancellation. */
export const lockDeletionUser = async (payload: Payload, userId: number, req: DeletionRequest): Promise<User> => {
  const db = await getTransactionAwareDrizzle(payload, req);
  await db.execute(sql`SELECT id FROM payload.users WHERE id = ${userId} FOR UPDATE`);
  const user = await payload.findByID({ collection: "users", id: userId, overrideAccess: true, req });
  if (user.role === "admin") {
    // Different admin accounts share the last-admin invariant until this transaction commits.
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('timetiles:account-deletion:admins'))`);
  }
  return user;
};

/** Commit a state change before the caller sends its best-effort notification. */
export const withLockedDeletionUser = async (
  payload: Payload,
  userId: number,
  change: (user: User, req: DeletionRequest) => Promise<void>
): Promise<User> => {
  const req = { payload, context: {} } as DeletionRequest;
  const ownsTransaction = await initTransaction(req);
  try {
    const user = await lockDeletionUser(payload, userId, req);
    await change(user, req);
    if (ownsTransaction) await commitTransaction(req);
    return user;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};

export const cancelPendingDeletion = (payload: Payload, userId: number): Promise<User> =>
  withLockedDeletionUser(payload, userId, async (user, req) => {
    if (user.deletionStatus !== "pending_deletion") throw new ValidationError("No pending deletion to cancel");
    await payload.update({
      collection: "users",
      id: userId,
      data: { deletionStatus: "active", deletionRequestedAt: null, deletionScheduledAt: null },
      overrideAccess: true,
      req,
    });
  });
