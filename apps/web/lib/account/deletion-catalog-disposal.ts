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
 * Transfer and deletion are both scoped by the entity's OWN `isPublic`, and two kinds of
 * dataset fall between them: a public dataset inside a private catalog (allowed — only the
 * reverse is rejected, see validateDatasetVisibility) is transferred and therefore survives,
 * and a dataset another user created in this catalog is neither transferred nor deleted.
 * Deleting the catalog underneath either of them set `datasets.catalog_id` to NULL, because
 * that is the FK's ON DELETE action — leaving a surviving dataset with no catalog at all,
 * which the field declares `required`, so every later update of it fails validation.
 *
 * Keeping the catalog is the non-destructive resolution: it stays private, so nothing
 * becomes newly visible, and the data the user was promised would be preserved keeps a
 * valid parent. Deleting the leftovers instead would destroy public events this very run
 * counted as "transferred" in the user's confirmation email.
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
