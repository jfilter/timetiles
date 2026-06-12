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

import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { projectNumberFormats } from "@/lib/filters/resolve-number-formats";
import type { EventFilters as EventQueryParams } from "@/lib/schemas/events";
import { canAccessCatalog } from "@/lib/services/access-control";
import type { FieldStatistics } from "@/lib/types/schema-detection";
import type { User } from "@/payload-types";

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

  await resolveDatasetFieldContext(filters, payload, user);

  return { denied: false, filters };
};

/**
 * Resolve dataset-level field semantics for active field/range filters.
 *
 * Both resolutions are SINGLE-DATASET only (confirmed decision — the explore
 * UI offers categorical and range filters only with exactly one dataset
 * selected), so the dataset document is loaded ONCE for both:
 *
 * - Tag fields: field-filter keys whose {@link FieldStatistics.isTagField} is
 *   set are collected into `filters.tagFields`, switching the SQL builders and
 *   PG functions to array-containment matching. Without this, a scalar `IN`
 *   compare against the array's JSON text matches nothing.
 * - Range formats: each range key's number-kind column policy is projected to
 *   a {@link NumberFormat}. A range key with no number column policy is
 *   dropped: without a known format we cannot safely normalize stored text to
 *   `::numeric`. With anything other than exactly one dataset, all range
 *   filters are dropped.
 */
const resolveDatasetFieldContext = async (
  filters: CanonicalEventFilters,
  payload: Payload,
  user?: User | null
): Promise<void> => {
  const hasRangeFilters = filters.rangeFilters != null && Object.keys(filters.rangeFilters).length > 0;
  const hasFieldFilters = filters.fieldFilters != null && Object.keys(filters.fieldFilters).length > 0;
  if (!hasRangeFilters && !hasFieldFilters) return;

  // Cross-dataset gate: both resolutions require exactly one dataset.
  if (filters.datasets?.length !== 1) {
    if (hasRangeFilters) delete filters.rangeFilters;
    return;
  }

  const datasetId = filters.datasets[0]!;
  // disableErrors: a missing/inaccessible dataset yields null (range filters are
  // then dropped) rather than throwing and 500ing the whole list request.
  const dataset = await payload.findByID({
    collection: "datasets",
    id: datasetId,
    depth: 0,
    select: { interpretationPlan: true, fieldMetadata: true },
    user,
    overrideAccess: false,
    disableErrors: true,
  });

  if (hasFieldFilters) {
    const fieldMetadata = (dataset?.fieldMetadata ?? null) as Record<string, FieldStatistics> | null;
    const tagKeys = Object.keys(filters.fieldFilters!).filter((key) => fieldMetadata?.[key]?.isTagField === true);
    if (tagKeys.length > 0) {
      filters.tagFields = new Set(tagKeys);
    }
  }

  if (!hasRangeFilters) return;

  // Project each requested range key to its resolved NumberFormat. Keys whose
  // column has no number policy are omitted by the projector; drop those from
  // the range filter (cannot ::numeric-normalize without a known format).
  const numberFormats = projectNumberFormats(dataset?.interpretationPlan, Object.keys(filters.rangeFilters!));
  for (const key of Object.keys(filters.rangeFilters!)) {
    if (!(key in numberFormats)) delete filters.rangeFilters![key];
  }

  if (Object.keys(filters.rangeFilters!).length === 0) {
    delete filters.rangeFilters;
    return;
  }
  filters.numberFormats = numberFormats;
};
