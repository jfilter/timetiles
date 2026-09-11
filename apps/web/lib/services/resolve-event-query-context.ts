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

  // Re-check: the cross-dataset gate above sets denyResults, and the JSONB
  // adapters for the PG-function endpoints cannot express a deny — those routes
  // would return unfiltered rows where the SQL/Payload paths return none.
  if (filters.denyResults) {
    return { denied: true };
  }

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
 *   denied: without a known format we cannot safely normalize stored text to
 *   `::numeric`. Range filters also require exactly one dataset.
 */
/**
 * Resolve dataset-scoped filter context (tag-field containment + number formats
 * for range filters) onto `filters`. Exported so the per-dataset stats routes
 * (enum-stats / numeric-stats) apply the SAME resolution as the main event
 * endpoints; without it a tag filter takes the scalar SQL branch (zeroing rows)
 * and range filters are silently dropped.
 */
export const resolveDatasetFieldContext = async (
  filters: CanonicalEventFilters,
  payload: Payload,
  user?: User | null
): Promise<void> => {
  const hasRangeFilters = filters.rangeFilters != null && Object.keys(filters.rangeFilters).length > 0;
  const hasFieldFilters = filters.fieldFilters != null && Object.keys(filters.fieldFilters).length > 0;
  if (!hasRangeFilters && !hasFieldFilters) return;

  // Cross-dataset gate: both resolutions require exactly one dataset.
  // Range filters cannot be resolved without one dataset's number-format policy,
  // so deny the query rather than silently returning the unfiltered result set.
  if (filters.datasets?.length !== 1) {
    if (hasRangeFilters) filters.denyResults = true;
    return;
  }

  const datasetId = filters.datasets[0]!;
  // disableErrors: a missing/inaccessible dataset yields null; range-filtered
  // queries are then denied rather than returning a broader result or a 500.
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

  // Every requested range must be enforceable. Dropping even one unknown key
  // broadens the result beyond the caller's requested constraints.
  const numberFormats = projectNumberFormats(dataset?.interpretationPlan, Object.keys(filters.rangeFilters!));
  if (Object.keys(filters.rangeFilters!).some((key) => !Object.hasOwn(numberFormats, key))) {
    filters.denyResults = true;
    return;
  }
  filters.numberFormats = numberFormats;
};
