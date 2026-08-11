/**
 * Lifecycle hooks for the events collection.
 *
 * This module contains hooks for quota tracking when events are created.
 * Event statistics (counts) are computed on-demand from the database
 * rather than being cached for better performance.
 *
 * @module
 * @category Collections
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
} from "payload";
import { Forbidden } from "payload";

import {
  extractDenormalizedAccessFields,
  isDenormSyncWrite,
  safeFetchRecord,
  stripClientDenormFields,
} from "@/lib/collections/catalog-ownership";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { logError } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { Event } from "@/payload-types";

type EventQuotaRequest = PayloadRequest & { eventQuotaClaimedForUser?: string | number };

/** Check and increment event creation quota for user */
const checkEventQuota = async (req: PayloadRequest): Promise<void> => {
  if (!req.user) return;

  const quotaService = createQuotaService(req.payload);
  await quotaService.checkAndIncrementUsage(req.user, "TOTAL_EVENTS", 1, req);

  // Only claim compensation for a NON-transactional increment. On Postgres the create always
  // runs in a transaction, and Payload's create op calls killTransaction() in its catch —
  // rolling the increment back AND deleting req.transactionID before afterError fires. The
  // compensating decrement would then run outside the (already rolled back) transaction and
  // subtract a SECOND time. Since decrementUsage floors at 0, alternating one good create
  // with one deliberately failing one pins the counter at 0 and defeats the limit entirely.
  // Same guard as scraper-repos.ts, which hit this first.
  if (req.transactionID) return;
  (req as EventQuotaRequest).eventQuotaClaimedForUser = req.user.id;
};

const clearEventQuotaClaim = (req: PayloadRequest): void => {
  (req as EventQuotaRequest).eventQuotaClaimedForUser = undefined;
};

const compensateEventQuotaOnError = async (req: PayloadRequest): Promise<void> => {
  const marked = req as EventQuotaRequest;
  const userId = marked.eventQuotaClaimedForUser;
  if (userId == null) return;

  marked.eventQuotaClaimedForUser = undefined;

  try {
    const quotaService = createQuotaService(req.payload);
    await quotaService.decrementUsage(userId, "TOTAL_EVENTS", 1, req);
  } catch (error) {
    logError(error, "Failed to compensate TOTAL_EVENTS after event create failure", { userId });
  }
};

/**
 * Before change hook for events.
 * - Sets datasetIsPublic and catalogOwnerId from the dataset/catalog for access control
 * - Validates quotas before event creation
 */
/** Denormalized access-control fields on events — derived here, never client-supplied. */
const EVENT_DENORM_FIELDS = ["datasetIsPublic", "catalogOwnerId"] as const;

export const eventsBeforeChangeHook: CollectionBeforeChangeHook<Event> = async ({ data: incoming, operation, req }) => {
  // A client PATCH that omits `dataset` skips the derivation below, so without
  // this the caller's own datasetIsPublic/catalogOwnerId would be stored —
  // publishing a single event out of a private dataset.
  const data = stripClientDenormFields(incoming, req, EVENT_DENORM_FIELDS);

  // Set denormalized access control fields.
  // Skipped for an internal resync: those writes carry the authoritative values,
  // and re-deriving would restore the grant a catalog delete is busy removing.
  if (data?.dataset && !isDenormSyncWrite(req)) {
    const datasetId = requireRelationId(data.dataset, "event.dataset");
    const dataset = await safeFetchRecord(req, "datasets", datasetId, 1);

    if (!dataset) {
      // Fail closed: silently skipping the derivation left the row's previous
      // catalogOwnerId/datasetIsPublic in place, so a lookup failure handed the
      // old owner continued read access to an event that had moved on.
      throw new Error(`Event dataset ${datasetId} could not be resolved for access-field derivation`);
    }

    const accessFields = extractDenormalizedAccessFields(dataset);

    // The collection's `update` access decides WHICH events you may touch —
    // it filters on the event's current catalogOwnerId. It says nothing about
    // the dataset you may move one INTO, and `dataset` carries no field-level
    // access of its own. Without this check an owner could PATCH their own
    // event's dataset to someone else's: the assignment below would then
    // recompute catalogOwnerId from the new dataset and hand the event to the
    // victim, injecting attacker-controlled rows into their dataset (and
    // publishing them, if that dataset is public).
    //
    // Only enforced for a non-privileged acting user. Import jobs and other
    // system writes run without a user, and editors/admins may legitimately
    // move events between catalogs.
    if (req.user && !isPrivileged(req.user) && accessFields.catalogOwnerId !== req.user.id) {
      throw new Forbidden(req.t);
    }

    // Assign collected values (avoids race condition warnings)
    Object.assign(data, accessFields);
  }

  // Skip quota checks for system operations and admin users
  if (!req.user || req.user.role === "admin") {
    return data;
  }

  // Check quotas on creation
  if (operation === "create") {
    await checkEventQuota(req);
  }

  return data;
};

/**
 * Clear the quota claim once the create succeeded, mirroring catalogs and
 * scraper-repos. Without this, a later unrelated error on the same request
 * would wrongly decrement TOTAL_EVENTS via the afterError compensation.
 */
export const eventsAfterChangeHook: CollectionAfterChangeHook<Event> = ({ doc, operation, req }) => {
  if (operation === "create") {
    clearEventQuotaClaim(req);
  }
  return doc;
};

export const eventsAfterErrorHook: CollectionAfterErrorHook = async ({ req }) => {
  await compensateEventQuotaOnError(req);
};
