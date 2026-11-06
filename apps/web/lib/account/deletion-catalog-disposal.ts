/**
 * Disposal of a private catalog during account deletion.
 *
 * Split out of deletion-service to keep that file under the 500-line ceiling.
 *
 * @module
 * @category Services
 */
import type { Payload, PayloadRequest } from "payload";

import { createLogger } from "../logger";
import type { ExecuteDeletionResult } from "./deletion-types";

const logger = createLogger("account-deletion-service");

type TransactionReq = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

interface DisposalContext {
  userId: number;
  systemUserId: number;
  result: ExecuteDeletionResult;
  req: TransactionReq;
}

/**
 * Delete a private catalog, or hand it to the system user when something still lives in it.
 *
 * Transfer and deletion are both scoped by the entity's OWN `isPublic`, so two kinds of
 * dataset survive in a private catalog: a public dataset (transferred) and a dataset another
 * user created there (untouched). Deleting the catalog would null their `catalog_id` via the
 * FK's ON DELETE SET NULL, breaking the required field. Keeping the catalog private is the
 * non-destructive resolution: nothing becomes newly visible and the survivors keep a parent.
 */
export const disposeOfPrivateCatalog = async (
  payload: Payload,
  catalogId: number,
  { userId, systemUserId, result, req }: DisposalContext
): Promise<void> => {
  const remaining = await payload.count({
    collection: "datasets",
    where: { catalog: { equals: catalogId } },
    // Datasets are a trash-enabled collection, and a soft-deleted row still holds its
    // catalog_id. Counting without this would report zero, delete the catalog, and let
    // ON DELETE SET NULL strip the parent from a dataset that can then never be restored:
    // `catalog` is a required field.
    trash: true,
    overrideAccess: true,
    req,
  });

  if (remaining.totalDocs === 0) {
    await payload.delete({ collection: "catalogs", id: catalogId, overrideAccess: true, req });
    result.dataDeleted.catalogs++;
    return;
  }

  await payload.update({
    collection: "catalogs",
    id: catalogId,
    data: { createdBy: systemUserId },
    overrideAccess: true,
    req,
  });
  result.dataTransferred.catalogs++;

  logger.warn("Kept a private catalog during account deletion — datasets still reference it", {
    userId,
    catalogId,
    remainingDatasets: remaining.totalDocs,
  });
};
