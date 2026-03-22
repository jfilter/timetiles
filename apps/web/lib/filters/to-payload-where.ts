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
import { isValidFieldKey } from "./field-validation";

/**
 * Convert canonical filters to a Payload CMS Where object.
 *
 * Includes catalog access control and field key validation.
 */
export const toPayloadWhere = (filters: CanonicalEventFilters): Where => {
  if (filters.denyResults) {
    return { and: [{ id: { equals: -1 } }] };
  }

  const and: Where[] = [
    ...buildCatalogWhere(filters),
    ...buildDatasetWhere(filters),
    ...buildDateWhere(filters),
    ...(filters.bounds ? buildBoundsWhere(filters.bounds) : []),
    ...(filters.requireLocation ? buildLocationWhere() : []),
    ...buildFieldFilterWhere(filters.fieldFilters),
  ];

  return and.length > 0 ? { and } : {};
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

const buildFieldFilterWhere = (fieldFilters?: Record<string, string[]>): Where[] => {
  if (!fieldFilters) return [];
  return Object.entries(fieldFilters)
    .filter(([fieldPath, values]) => values.length > 0 && isValidFieldKey(fieldPath))
    .map(([fieldPath, values]) => ({ [`originalData.${fieldPath}`]: { in: values } }));
};

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
