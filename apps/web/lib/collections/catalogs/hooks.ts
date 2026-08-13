/**
 * Lifecycle hooks for catalogs collection.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  PayloadRequest,
} from "payload";
import { killTransaction } from "payload";

import { assertNoBulkErrors, withDenormSync } from "@/lib/collections/catalog-ownership";
import { createQuotaClaimLifecycle } from "@/lib/collections/quota-claim";
import { createLogger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";

import { setCreatedByHook } from "../shared-fields";

const logger = createLogger("catalogs");

/** Validates that private catalogs are allowed if isPublic is false. */
const validatePrivateVisibility = async (data: Record<string, unknown>, req: PayloadRequest): Promise<void> => {
  if (data.isPublic === false) {
    const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
    const enabled = await getFeatureFlagService(req.payload).isEnabled("allowPrivateImports");
    if (!enabled) {
      throw new Error("Private catalogs are currently disabled. Please make the catalog public.");
    }
  }
};

/** Claim/clear/compensate for CATALOGS_PER_USER; see createQuotaClaimLifecycle for the transaction rule. */
const catalogQuota = createQuotaClaimLifecycle({
  contextKey: "catalogQuotaClaimedForUser",
  quotaKey: "CATALOGS_PER_USER",
});

/** Detect what changed between previous and new catalog doc */
const detectCatalogChanges = (
  previousDoc: Record<string, unknown> | undefined,
  doc: Record<string, unknown>
): CatalogChanges => {
  // Normalize to null: a cleared owner must CASCADE as null, not vanish as undefined.
  const prevCreatedBy = extractRelationId<unknown>(previousDoc?.createdBy) ?? null;
  const newCreatedBy = extractRelationId<unknown>(doc.createdBy) ?? null;
  const prevIsPublic = (previousDoc?.isPublic as boolean) ?? false;
  const newIsPublic = (doc.isPublic as boolean) ?? false;

  return {
    createdByChanged: prevCreatedBy !== newCreatedBy,
    isPublicChanged: prevIsPublic !== newIsPublic,
    newCreatedBy: newCreatedBy as number | null,
    newIsPublic,
  };
};

type CatalogChanges = {
  createdByChanged: boolean;
  isPublicChanged: boolean;
  newCreatedBy: number | null;
  newIsPublic: boolean;
};

/** Sync catalog changes to child datasets */
const syncDatasetsWithCatalog = async (
  req: PayloadRequest,
  catalogId: number,
  changes: CatalogChanges
): Promise<void> => {
  const datasetUpdates: Record<string, unknown> = {};
  if (changes.createdByChanged) datasetUpdates.catalogCreatorId = changes.newCreatedBy;
  if (changes.isPublicChanged) datasetUpdates.catalogIsPublic = changes.newIsPublic;

  if (Object.keys(datasetUpdates).length > 0) {
    await withDenormSync(req, async () => {
      const result = await req.payload.update({
        collection: "datasets",
        where: { catalog: { equals: catalogId } },
        data: datasetUpdates,
        overrideAccess: true,
        req,
      });
      assertNoBulkErrors(result, "Catalog sync to datasets");
    });
  }
};

/** Datasets per bulk sync round — keeps IN lists and hook concurrency bounded. */
const DENORM_SYNC_CHUNK_SIZE = 200;

/** Bulk update a single collection for catalog sync */
const bulkSyncCollection = async (
  req: PayloadRequest,
  collection: "events" | "dataset-schemas",
  datasets: Array<{ id: number; isPublic: boolean }>,
  changes: CatalogChanges
): Promise<void> =>
  withDenormSync(req, async () => {
    const allIds = datasets.map((d) => d.id);
    // Spread an ABSENT key when ownership did not change — writing `undefined` would be
    // dropped by Payload, so a cleared owner has to reach the children as an explicit null.
    const ownerData = changes.createdByChanged ? { catalogOwnerId: changes.newCreatedBy } : {};

    const syncIds = async (ids: number[], data: Record<string, unknown>): Promise<void> => {
      if (ids.length === 0) return;
      const result = await req.payload.update({
        collection,
        where: { dataset: { in: ids } },
        data,
        overrideAccess: true,
        req,
      });
      assertNoBulkErrors(result, `Catalog sync to ${collection}`);
    };

    if (!changes.isPublicChanged) {
      // Only ownership changed — same update for all datasets
      await syncIds(allIds, ownerData);
    } else if (!changes.newIsPublic) {
      // Catalog became private — all children become non-public
      await syncIds(allIds, { datasetIsPublic: false, ...ownerData });
    } else {
      // Catalog became public — visibility depends on each dataset's own isPublic
      await syncIds(
        datasets.filter((d) => d.isPublic).map((d) => d.id),
        { datasetIsPublic: true, ...ownerData }
      );
      await syncIds(
        datasets.filter((d) => !d.isPublic).map((d) => d.id),
        { datasetIsPublic: false, ...ownerData }
      );
    }
  });

/** Batch sync catalog changes to events and dataset-schemas across all datasets.
 * Groups updates by dataset visibility to minimize DB calls (max 4 instead of 2N). */
const batchSyncChildRecords = async (
  req: PayloadRequest,
  datasets: Array<{ id: number; isPublic: boolean }>,
  changes: CatalogChanges
): Promise<void> => {
  if (datasets.length === 0) return;
  if (!changes.createdByChanged && !changes.isPublicChanged) return;

  // Chunked: a catalog with thousands of datasets would otherwise produce one
  // enormous IN list and let Payload run that many per-document hooks at once.
  for (let offset = 0; offset < datasets.length; offset += DENORM_SYNC_CHUNK_SIZE) {
    const chunk = datasets.slice(offset, offset + DENORM_SYNC_CHUNK_SIZE);
    await bulkSyncCollection(req, "events", chunk, changes);
    await bulkSyncCollection(req, "dataset-schemas", chunk, changes);
  }
};

export const catalogBeforeChangeHooks: CollectionBeforeChangeHook[] = [
  setCreatedByHook,
  async ({ data, req, operation }) => {
    // Validate private visibility is allowed
    if (operation === "create" || operation === "update") {
      await validatePrivateVisibility(data, req);
    }

    // Handle quota check and increment for new catalogs
    if (operation === "create") {
      await catalogQuota.claim(req);
    }

    return data;
  },
];

export const catalogAfterChangeHooks: CollectionAfterChangeHook[] = [
  async ({ doc, previousDoc, operation, req }) => {
    if (operation === "create") {
      catalogQuota.clear(req);
      return doc;
    }

    // Sync catalog changes to datasets and events (for access control)
    if (operation !== "update") return doc;

    const changes = detectCatalogChanges(previousDoc, doc);
    if (!changes.createdByChanged && !changes.isPublicChanged) return doc;

    // Audit visibility and ownership changes (best-effort)
    const ownerId = extractRelationId<number>(doc.createdBy);
    if (ownerId) {
      try {
        const owner = await req.payload.findByID({
          collection: "users",
          id: ownerId,
          overrideAccess: true,
          depth: 0,
          req,
        });

        if (changes.isPublicChanged) {
          await auditLog(
            req.payload,
            {
              action: AUDIT_ACTIONS.CATALOG_VISIBILITY_CHANGED,
              userId: ownerId,
              userEmail: owner.email,
              performedBy: req.user?.id === ownerId ? undefined : req.user?.id,
              details: {
                catalogId: doc.id,
                catalogName: doc.name,
                previousIsPublic: !changes.newIsPublic,
                newIsPublic: changes.newIsPublic,
              },
            },
            { req }
          );
        }

        if (changes.createdByChanged) {
          const prevOwnerId = extractRelationId<number>(previousDoc?.createdBy);
          await auditLog(
            req.payload,
            {
              action: AUDIT_ACTIONS.CATALOG_OWNERSHIP_TRANSFERRED,
              userId: prevOwnerId ?? ownerId,
              userEmail: owner.email,
              performedBy: req.user?.id,
              details: { catalogId: doc.id, catalogName: doc.name, previousOwnerId: prevOwnerId, newOwnerId: ownerId },
            },
            { req }
          );
        }
      } catch (error) {
        logger.warn("Audit log failed for catalog change", { catalogId: doc.id, error });
      }
    }

    // Get all datasets in this catalog (needed for events update)
    const datasets = await req.payload.find({
      collection: "datasets",
      where: { catalog: { equals: doc.id } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    });

    // Sync changes to datasets
    await syncDatasetsWithCatalog(req, doc.id, changes);

    // Sync changes to events and dataset-schemas (batched to avoid N+1)
    await batchSyncChildRecords(
      req,
      datasets.docs.map((d) => ({ id: d.id, isPublic: d.isPublic ?? false })),
      changes
    );

    return doc;
  },
];

/**
 * Drop the access this catalog grants to everything below it, before it is deleted.
 *
 * `datasets.catalog_id` is ON DELETE SET NULL and no dataset hook runs on that
 * cascade, so without this the orphaned datasets keep `catalogCreatorId` /
 * `catalogIsPublic` — and every event and dataset-schema below them keeps the
 * `catalogOwnerId` copied from it — and the former catalog owner goes on reaching
 * rows whose catalog no longer exists.
 *
 * Only the OWNER grant is dropped. The public flags stay frozen as they are: an
 * orphaned public dataset remains readable to everyone, which is the deliberate
 * behaviour covered by the orphaned-resources access tests.
 *
 * Has to run BEFORE the delete: afterwards `catalog` is NULL, and it is a required
 * field, so every update of an orphaned dataset fails validation. The write is
 * marked as a denorm resync, which is also what stops the datasets hook from
 * re-deriving the values from the catalog that is about to disappear.
 */
export const catalogBeforeDeleteHook: CollectionBeforeDeleteHook = async ({ req, id }) => {
  try {
    await clearCatalogGrants(req, id);
  } catch (error) {
    // A BULK delete (`delete({ where })`) collects per-document hook errors and still
    // commits the shared transaction — the catalog would survive while the grants this
    // hook already cleared stayed cleared. Kill the transaction so the whole operation
    // is all-or-nothing instead of leaving half-stripped access fields behind.
    await killTransaction(req);
    throw error;
  }
};

const clearCatalogGrants = async (req: PayloadRequest, id: number | string): Promise<void> => {
  const datasets = await req.payload.find({
    collection: "datasets",
    where: { catalog: { equals: id } },
    limit: 0,
    pagination: false,
    depth: 0,
    // A soft-deleted dataset still carries the grant and can be restored later.
    trash: true,
    overrideAccess: true,
    req,
  });

  if (datasets.docs.length === 0) return;

  const children = datasets.docs.map((d) => ({ id: d.id, isPublic: d.isPublic ?? false }));

  await batchSyncChildRecords(req, children, {
    createdByChanged: true,
    isPublicChanged: false,
    newCreatedBy: null,
    newIsPublic: false,
  });

  for (let offset = 0; offset < children.length; offset += DENORM_SYNC_CHUNK_SIZE) {
    const ids = children.slice(offset, offset + DENORM_SYNC_CHUNK_SIZE).map((d) => d.id);
    await withDenormSync(req, async () => {
      const result = await req.payload.update({
        collection: "datasets",
        where: { id: { in: ids } },
        data: { catalogCreatorId: null },
        overrideAccess: true,
        trash: true,
        req,
      });
      assertNoBulkErrors(result, "Catalog delete clearing dataset grants");
    });
  }
};

export const catalogAfterDeleteHook: CollectionAfterDeleteHook = async ({ doc, req }) => {
  // Decrement catalog count when catalog is deleted
  if (doc.createdBy && req.payload) {
    const quotaService = createQuotaService(req.payload);
    await quotaService.decrementUsage(doc.createdBy, "CATALOGS_PER_USER", 1, req);
  }
};

export const catalogAfterErrorHook: CollectionAfterErrorHook = async ({ req }) => {
  await catalogQuota.compensate(req);
};
