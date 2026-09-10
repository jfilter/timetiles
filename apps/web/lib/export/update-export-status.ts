/**
 * Serialize export status changes with retirement and account deletion.
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import type { DataExport } from "@/payload-types";

export const updateExportStatus = async (
  payload: Payload,
  id: number,
  data: Partial<DataExport>,
  allowedStatuses: DataExport["status"][]
): Promise<boolean> => {
  const req = { payload, context: {} } as PayloadRequest;
  const ownsTransaction = await initTransaction(req);
  try {
    const drizzle = await getTransactionAwareDrizzle(payload, req);
    await drizzle.execute(sql`SELECT id FROM payload.data_exports WHERE id = ${id} FOR UPDATE`);
    const record = await payload.findByID({
      collection: "data-exports",
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    });
    const allowed = record !== null && allowedStatuses.includes(record.status);
    if (allowed) {
      await payload.update({ collection: "data-exports", id, data, overrideAccess: true, req });
    }
    if (ownsTransaction) await commitTransaction(req);
    return allowed;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};
