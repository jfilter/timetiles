/**
 * Payload CMS Where output adapter for canonical event filters.
 *
 * Converts {@link CanonicalEventFilters} to a Payload CMS `Where`
 * query object for use with `payload.find()`.
 *
 * @module
 * @category Filters
 */
import type { Where } from "payload";

import type { CanonicalBounds, CanonicalEventFilters } from "./canonical-event-filters";

/**
 * Convert canonical filters to a Payload CMS Where object.
 *
 * Includes catalog access control and field key validation.
 */
export const toPayloadWhere = (filters: CanonicalEventFilters): Where => {
  if (filters.denyResults) {
    return { and: [{ id: { equals: -1 } }] };
  }

  // Field filters are NOT included here — Payload's JSONB query sanitizer
  // rejects values with characters outside /^[\w @.\-+:]*$/ (e.g. parentheses).
  // Field filters are applied via raw SQL in the route handler instead.
  const and: Where[] = [
    buildAccessWhere(filters),
    ...buildCatalogWhere(filters),
    ...buildDatasetWhere(filters),
    ...buildDateWhere(filters),
    ...(filters.bounds ? buildBoundsWhere(filters.bounds) : []),
    ...(filters.requireLocation ? buildLocationWhere() : []),
  ];

  return and.length > 0 ? { and } : {};
};

// Mirrors buildEventAccessCondition in to-sql-conditions.ts: public events are
// included unless includePublic is explicitly false, the owner always sees
// their own events, and no grant at all matches nothing (SQL returns FALSE).
const buildAccessWhere = (filters: CanonicalEventFilters): Where => {
  const grants: Where[] = [];

  if (filters.includePublic !== false) {
    grants.push({ datasetIsPublic: { equals: true } });
  }

  if (filters.ownerId != null) {
    grants.push({ catalogOwnerId: { equals: filters.ownerId } });
  }

  if (grants.length === 0) {
    return { id: { equals: -1 } };
  }

  return grants.length === 1 ? grants[0]! : { or: grants };
};

const buildCatalogWhere = (filters: CanonicalEventFilters): Where[] => {
  if (filters.catalogId != null) return [{ "dataset.catalog": { equals: filters.catalogId } }];
  if (filters.catalogIds != null && filters.catalogIds.length > 0)
    return [{ "dataset.catalog": { in: filters.catalogIds } }];
  return [];
};

const buildDatasetWhere = (filters: CanonicalEventFilters): Where[] =>
  filters.datasets != null && filters.datasets.length > 0 ? [{ dataset: { in: filters.datasets } }] : [];

const buildDateWhere = (filters: CanonicalEventFilters): Where[] => {
  const dateFilter: Record<string, string> = {};
  if (filters.startDate != null) dateFilter.greater_than_equal = filters.startDate;
  if (filters.endDate != null) dateFilter.less_than_equal = filters.endDate;
  return Object.keys(dateFilter).length > 0 ? [{ eventTimestamp: dateFilter }] : [];
};

const buildLocationWhere = (): Where[] => [
  { "location.latitude": { exists: true } },
  { "location.longitude": { exists: true } },
];

const buildBoundsWhere = (bounds: CanonicalBounds): Where[] => {
  const conditions: Where[] = [
    { "location.latitude": { greater_than_equal: bounds.south } },
    { "location.latitude": { less_than_equal: bounds.north } },
  ];

  if (bounds.west <= bounds.east) {
    conditions.push(
      { "location.longitude": { greater_than_equal: bounds.west } },
      { "location.longitude": { less_than_equal: bounds.east } }
    );
  } else {
    // Anti-meridian crossing
    conditions.push({
      or: [
        { "location.longitude": { greater_than_equal: bounds.west } },
        { "location.longitude": { less_than_equal: bounds.east } },
      ],
    });
  }

  return conditions;
};
