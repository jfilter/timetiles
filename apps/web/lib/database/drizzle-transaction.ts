/**
 * Transaction-aware Drizzle ORM access.
 *
 * Extracts the Drizzle instance from Payload's database adapter, reusing the
 * caller's transaction connection when available to prevent pool exhaustion.
 *
 * Payload's internal session/drizzle types aren't publicly exported, so the
 * return type is necessarily `Record<string, any>`.
 *
 * @module
 * @category Database
 */
import type { Payload, PayloadRequest } from "payload";

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Payload's internal Drizzle type isn't publicly exported
export type DrizzleInstance = Record<string, any>;

/**
 * Get the transaction-aware Drizzle instance from Payload's database adapter.
 *
 * When called with a `req` that has a `transactionID`, returns the Drizzle
 * client bound to that transaction. Otherwise returns the default Drizzle client.
 * This prevents pool exhaustion when called from Payload hooks that already hold
 * a transaction connection.
 */
export const getTransactionAwareDrizzle = async (
  payload: Payload,
  req?: Partial<Pick<PayloadRequest, "transactionID">>
): Promise<DrizzleInstance> => {
  const db = payload.db;
  if (req?.transactionID && "sessions" in db) {
    const sessions = (db as unknown as Record<string, unknown>).sessions as
      | Record<string, { db: unknown } | undefined>
      | undefined;
    if (sessions) {
      const transactionID = req.transactionID instanceof Promise ? await req.transactionID : req.transactionID;
      return (sessions[String(transactionID)]?.db as DrizzleInstance) ?? db.drizzle;
    }
  }
  return db.drizzle;
};
