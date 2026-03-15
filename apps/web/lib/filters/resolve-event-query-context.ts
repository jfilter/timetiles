/**
 * Shared access-control + filter resolution for event API routes.
 *
 * Combines the catalog access check and canonical filter building that
 * every event endpoint repeats. Returns either valid filters or a
 * denied flag so the route can return its empty response immediately.
 *
 * @module
 * @category Filters
 */
import type { Payload } from "payload";

import type { EventFilters as EventQueryParams } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import type { User } from "@/payload-types";

import { buildCanonicalFilters } from "./build-canonical-filters";
import type { CanonicalEventFilters } from "./canonical-event-filters";

interface ResolveOptions {
  payload: Payload;
  user?: User | null;
  query: EventQueryParams;
  requireLocation?: boolean;
}

type EventQueryContext =
  | { denied: true }
  | { denied: false; filters: CanonicalEventFilters; accessibleCatalogIds: number[] };

/**
 * Resolve event query context with access control.
 *
 * 1. Fetches accessible catalog IDs for the user
 * 2. Returns denied if no catalogs are accessible and no explicit catalog filter
 * 3. Builds canonical filters from the query parameters
 * 4. Returns denied if the filter pipeline denies access (e.g. unauthorized catalog)
 */
export const resolveEventQueryContext = async ({
  payload,
  user,
  query,
  requireLocation,
}: ResolveOptions): Promise<EventQueryContext> => {
  const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

  if (accessibleCatalogIds.length === 0 && query.catalog == null) {
    return { denied: true };
  }

  const filters = buildCanonicalFilters({ parameters: query, accessibleCatalogIds, requireLocation });

  if (filters.denyResults) {
    return { denied: true };
  }

  return { denied: false, filters, accessibleCatalogIds };
};
