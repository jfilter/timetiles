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
import { canAccessCatalog } from "@/lib/services/access-control";
import type { User } from "@/payload-types";

import { buildCanonicalFilters } from "./build-canonical-filters";
import type { CanonicalEventFilters } from "./canonical-event-filters";

interface ResolveOptions {
  payload: Payload;
  user?: User | null;
  query: EventQueryParams;
  requireLocation?: boolean;
}

type EventQueryContext = { denied: true } | { denied: false; filters: CanonicalEventFilters };

/**
 * Resolve event query context with access control.
 *
 * 1. Validates any explicitly requested catalog against Payload access control
 * 2. Builds canonical filters from the query parameters
 * 3. Returns denied if the filter pipeline denies access (e.g. scoped catalog mismatch)
 */
export const resolveEventQueryContext = async ({
  payload,
  user,
  query,
  requireLocation,
}: ResolveOptions): Promise<EventQueryContext> => {
  let hasRequestedCatalogAccess: boolean | undefined;
  if (query.catalog != null) {
    hasRequestedCatalogAccess = await canAccessCatalog(payload, query.catalog, user);
    if (!hasRequestedCatalogAccess) {
      return { denied: true };
    }
  }

  const filters = buildCanonicalFilters({
    parameters: query,
    includePublic: true,
    ownerId: user?.id ?? null,
    hasRequestedCatalogAccess,
    requireLocation,
  });

  if (filters.denyResults) {
    return { denied: true };
  }

  return { denied: false, filters };
};
