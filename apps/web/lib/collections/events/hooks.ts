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
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from "payload";

import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService } from "@/lib/services/quota-service";
import type { Dataset, Event } from "@/payload-types";

/** Extract denormalized access control fields from dataset/catalog */
const extractAccessControlFields = (
  dataset: Dataset
): { datasetIsPublic: boolean; catalogOwnerId: number | undefined } => {
  const catalog = typeof dataset.catalog === "object" ? dataset.catalog : null;
  const catalogIsPublic = catalog?.isPublic ?? false;

  // datasetIsPublic should only be true if BOTH dataset AND catalog are public
  const datasetIsPublic = (dataset.isPublic ?? false) && catalogIsPublic;

  // Get catalog creator ID (owner)
  let catalogOwnerId: number | undefined;
  if (catalog?.createdBy) {
    catalogOwnerId = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
  }

  return { datasetIsPublic, catalogOwnerId };
};

/** Fetch dataset with catalog populated */
const fetchDatasetWithCatalog = async (req: PayloadRequest, datasetId: number | string): Promise<Dataset | null> => {
  try {
    return await req.payload.findByID({
      collection: "datasets",
      id: datasetId,
      depth: 1,
      overrideAccess: true,
      req,
    });
  } catch {
    return null;
  }
};

/** Check event creation quota for user */
const checkEventQuota = async (req: PayloadRequest): Promise<void> => {
  if (!req.user) return;

  const quotaService = getQuotaService(req.payload);
  const totalEventsCheck = await quotaService.checkQuota(req.user, QUOTA_TYPES.TOTAL_EVENTS, 1);

  if (!totalEventsCheck.allowed) {
    throw new Error(
      `Total events limit reached (${totalEventsCheck.current}/${totalEventsCheck.limit}). ` +
        `Please upgrade your account or remove old events.`
    );
  }
};

/**
 * Before change hook for events.
 * - Sets datasetIsPublic and catalogOwnerId from the dataset/catalog for access control
 * - Validates quotas before event creation
 */
export const eventsBeforeChangeHook: CollectionBeforeChangeHook<Event> = async ({ data, operation, req }) => {
  // Set denormalized access control fields
  if (data?.dataset) {
    const datasetId = typeof data.dataset === "object" ? data.dataset.id : data.dataset;
    const dataset = await fetchDatasetWithCatalog(req, datasetId);

    if (dataset) {
      const accessFields = extractAccessControlFields(dataset);
      // Assign collected values (avoids race condition warnings)
      Object.assign(data, accessFields);
    }
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
 * After change hook for events.
 * Tracks quota usage for event creation.
 */
export const eventsAfterChangeHook: CollectionAfterChangeHook<Event> = async ({ doc, operation, req }) => {
  if (operation === "create" && req.user && req.user.role !== "admin") {
    const quotaService = getQuotaService(req.payload);
    await quotaService.incrementUsage(req.user.id, USAGE_TYPES.TOTAL_EVENTS_CREATED, 1, req);
  }

  return doc;
};
