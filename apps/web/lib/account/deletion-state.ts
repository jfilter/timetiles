/**
 * Serialized account deletion state changes.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import type { User } from "@/payload-types";

export type DeletionRequest = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

/** Read the current user only after acquiring the lock shared by execution and cancellation. */
export const lockDeletionUser = async (payload: Payload, userId: number, req: DeletionRequest): Promise<User> => {
  const db = await getTransactionAwareDrizzle(payload, req);
  await db.execute(sql`SELECT id FROM payload.users WHERE id = ${userId} FOR UPDATE`);
  return payload.findByID({ collection: "users", id: userId, overrideAccess: true, req });
};

/** Commit cancellation before the caller sends its best-effort notification. */
export const cancelPendingDeletion = async (payload: Payload, userId: number): Promise<User> => {
  const req = { payload, context: {} } as DeletionRequest;
  const ownsTransaction = await initTransaction(req);
  try {
    const user = await lockDeletionUser(payload, userId, req);
    if (user.deletionStatus !== "pending_deletion") throw new Error("No pending deletion to cancel");
    await payload.update({
      collection: "users",
      id: userId,
      data: { deletionStatus: "active", deletionRequestedAt: null, deletionScheduledAt: null },
      overrideAccess: true,
      req,
    });
    if (ownsTransaction) await commitTransaction(req);
    return user;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};
