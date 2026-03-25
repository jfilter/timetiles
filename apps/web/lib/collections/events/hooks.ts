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
import type { CollectionBeforeChangeHook, PayloadRequest } from "payload";

import { extractDenormalizedAccessFields, safeFetchRecord } from "@/lib/collections/catalog-ownership";
import { createQuotaService } from "@/lib/services/quota-service";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset, Event } from "@/payload-types";

/** Check and increment event creation quota for user */
const checkEventQuota = async (req: PayloadRequest): Promise<void> => {
  if (!req.user) return;

  const quotaService = createQuotaService(req.payload);
  await quotaService.checkAndIncrementUsage(req.user, "TOTAL_EVENTS", 1, req);
};

/**
 * Before change hook for events.
 * - Sets datasetIsPublic and catalogOwnerId from the dataset/catalog for access control
 * - Validates quotas before event creation
 */
export const eventsBeforeChangeHook: CollectionBeforeChangeHook<Event> = async ({ data, operation, req }) => {
  // Set denormalized access control fields
  if (data?.dataset) {
    const datasetId = requireRelationId(data.dataset, "event.dataset");
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
