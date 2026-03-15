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

import { createQuotaService } from "@/lib/services/quota-service";
import { extractDenormalizedAccessFields, safeFetchRecord } from "@/lib/utils/catalog-ownership";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Dataset, Event } from "@/payload-types";

/** Check event creation quota for user */
const checkEventQuota = async (req: PayloadRequest): Promise<void> => {
  if (!req.user) return;

  const quotaService = createQuotaService(req.payload);
  const totalEventsCheck = await quotaService.checkQuota(req.user, "TOTAL_EVENTS", 1);

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
    const datasetId = extractRelationId(data.dataset)!;
    const dataset = await safeFetchRecord<Dataset>(req, "datasets", datasetId, 1);

    if (dataset) {
      const accessFields = extractDenormalizedAccessFields(dataset);
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
    const quotaService = createQuotaService(req.payload);
    await quotaService.incrementUsage(req.user.id, "TOTAL_EVENTS", 1, req);
  }

  return doc;
};
