/**
 * Canonical filter builder for event queries.
 *
 * Single entry point that applies access control, normalizes dates,
 * validates field keys, and produces a {@link CanonicalEventFilters}
 * object for downstream adapters.
 *
 * @module
 * @category Filters
 */
import { ValidationError } from "@/lib/api/errors";
import type { EventFilters as EventQueryParams } from "@/lib/schemas/events";

import type { CanonicalBounds, CanonicalEventFilters } from "./canonical-event-filters";
import { isValidFieldKey, sanitizeFieldFilters, sanitizeRangeFilters } from "./field-validation";

/**
 * Options for building canonical event filters.
 */
export interface BuildCanonicalFiltersOptions {
  /** Zod-validated query parameters */
  parameters: EventQueryParams;
  /** Whether public events should be included */
  includePublic?: boolean;
  /** Catalog owner ID for owner-visible reads */
  ownerId?: number | null;
  /** Whether the requested catalog is accessible to the caller */
  hasRequestedCatalogAccess?: boolean;
  /** Require events to have geocoded locations (default: false) */
  requireLocation?: boolean;
}

/**
 * Build canonical event filters with access control and normalization.
 *
 * Consolidates logic previously spread across event-filters.ts,
 * aggregation-filters.ts, event-sql-filters.ts, and events/route.ts.
 */
export const buildCanonicalFilters = ({
  parameters,
  includePublic = true,
  ownerId,
  hasRequestedCatalogAccess,
  requireLocation = false,
}: BuildCanonicalFiltersOptions): CanonicalEventFilters => {
  const filters: CanonicalEventFilters = { includePublic };

  if (ownerId != null) {
    filters.ownerId = ownerId;
  }

  if (requireLocation) {
    filters.requireLocation = true;
  }

  // Explicit catalog filter: resolve access up-front so downstream adapters
  // only have to apply the scoped catalog constraint.
  if (parameters.catalog != null) {
    if (hasRequestedCatalogAccess !== false) {
      filters.catalogId = parameters.catalog;
    } else {
      filters.denyResults = true;
    }
  }

  // Datasets
  if (parameters.datasets != null && parameters.datasets.length > 0) {
    filters.datasets = parameters.datasets;
  }

  // Dates (normalize end date; drop an inverted pair — see applyDateRange)
  applyDateRange(filters, parameters);

  // Bounds
  if (parameters.bounds != null) {
    filters.bounds = {
      north: parameters.bounds.north,
      south: parameters.bounds.south,
      east: parameters.bounds.east,
      west: parameters.bounds.west,
    } satisfies CanonicalBounds;
  }

  // Field + numeric range filters (validate keys/bounds at construction time)
  applyDataFieldFilters(filters, parameters);

  // H3 cell filter (precise spatial constraint).
  //
  // Cells that cannot be applied must deny, never fall through to "no spatial filter":
  // `?clusterCells=8a2a...` with no `h3Resolution` used to return the whole dataset with
  // HTTP 200. This mirrors buildH3CellSqlCondition, which emits FALSE when cells were
  // requested but none survive validation.
  if (parameters.clusterCells != null) {
    const cells = parameters.clusterCells.split(",").filter(Boolean);
    if (cells.length === 0 || parameters.h3Resolution == null) {
      filters.denyResults = true;
    } else {
      filters.clusterCells = cells;
      filters.h3Resolution = parameters.h3Resolution;
    }
  }

  // Scope constraints (view-level data scope)
  applyScopeConstraints(filters, parameters);

  return filters;
};

/**
 * Apply categorical field filters and numeric range filters from the parameters.
 *
 * The per-field NumberFormat needed to normalize stored text for range filters
 * is NOT known here — it is projected from the single dataset's interpretation
 * plan in resolveEventQueryContext, which also enforces the single-dataset gate.
 */
const applyDataFieldFilters = (filters: CanonicalEventFilters, parameters: EventQueryParams): void => {
  // A dropped filter must never degrade into "no filter". Sanitizing silently meant an
  // unusable key (too long, invalid characters, too deep a path, empty value list) produced
  // HTTP 200 with the FULL result set — the caller asked to narrow the data and got all of it.
  // An unusable KEY is a client error — reject it. An entry with no constraint
  // (empty value list, both bounds null) is benign and is still dropped silently.
  const invalidFieldKeys = Object.keys(parameters.ff).filter((key) => !isValidFieldKey(key));
  if (invalidFieldKeys.length > 0) {
    throw new ValidationError(`Invalid field filter key(s): ${invalidFieldKeys.join(", ")}`);
  }
  if (Object.keys(parameters.ff).length > 0) {
    const sanitized = sanitizeFieldFilters(parameters.ff);
    if (Object.keys(sanitized).length > 0) {
      filters.fieldFilters = sanitized;
    }
  }

  const invalidRangeKeys = Object.keys(parameters.rf).filter((key) => !isValidFieldKey(key));
  if (invalidRangeKeys.length > 0) {
    throw new ValidationError(`Invalid range filter key(s): ${invalidRangeKeys.join(", ")}`);
  }
  if (Object.keys(parameters.rf).length > 0) {
    const sanitizedRanges = sanitizeRangeFilters(parameters.rf);
    if (Object.keys(sanitizedRanges).length > 0) {
      filters.rangeFilters = sanitizedRanges;
    }
  }
};

/**
 * Apply the start/end date range, normalizing the end to the full day.
 *
 * An inverted pair (start after end) describes an EMPTY interval, so it must match nothing.
 * Dropping both bounds instead made the request fail OPEN: `?startDate=2026-06-01&
 * endDate=2026-01-01` returned every accessible event with HTTP 200, while the UI still
 * showed the date range as an active filter. `denyResults` is the established idiom here
 * for "these filters are well-formed but can match no row" (see applyScopeConstraints).
 */
const applyDateRange = (filters: CanonicalEventFilters, parameters: EventQueryParams): void => {
  const normalizedEnd = normalizeEndDate(parameters.endDate ?? null);
  const startTs = parameters.startDate != null ? Date.parse(parameters.startDate) : null;
  const endTs = normalizedEnd != null ? Date.parse(normalizedEnd) : null;
  const inverted =
    startTs != null && endTs != null && Number.isFinite(startTs) && Number.isFinite(endTs) && startTs > endTs;
  if (inverted) {
    filters.denyResults = true;
    return;
  }

  if (parameters.startDate != null) {
    filters.startDate = parameters.startDate;
  }
  if (normalizedEnd != null) {
    filters.endDate = normalizedEnd;
  }
};

/** Apply view-level scope constraints (scopeCatalogs / scopeDatasets). */
const applyScopeConstraints = (filters: CanonicalEventFilters, parameters: EventQueryParams): void => {
  if (filters.denyResults) return;

  const { scopeCatalogs, scopeDatasets } = parameters;

  if (scopeCatalogs != null && scopeCatalogs.length > 0) {
    applyCatalogScope(filters, scopeCatalogs);
  }

  if (!filters.denyResults && scopeDatasets != null && scopeDatasets.length > 0) {
    applyDatasetScope(filters, scopeDatasets);
  }
};

/** Intersect catalog access with view scope. */
const applyCatalogScope = (filters: CanonicalEventFilters, scopeCatalogs: number[]): void => {
  if (filters.catalogId != null) {
    if (!scopeCatalogs.includes(filters.catalogId)) {
      filters.denyResults = true;
      filters.catalogId = undefined;
    }
    return;
  }

  filters.catalogIds = scopeCatalogs;
};

/** Intersect user dataset selection with view scope. */
const applyDatasetScope = (filters: CanonicalEventFilters, scopeDatasets: number[]): void => {
  if (filters.datasets != null && filters.datasets.length > 0) {
    const intersection = filters.datasets.filter((id) => scopeDatasets.includes(id));
    if (intersection.length === 0) {
      filters.denyResults = true;
    } else {
      filters.datasets = intersection;
    }
  } else {
    filters.datasets = scopeDatasets;
  }
};

/**
 * Normalize end date to include the full day (23:59:59.999Z).
 *
 * @param endDate - ISO date string (e.g., "2024-12-31") or datetime string
 * @returns ISO datetime string with time set to end of day, or null
 */
export const normalizeEndDate = (endDate: string | null): string | null => {
  if (!endDate) return null;
  if (endDate.includes("T")) return endDate;
  return `${endDate}T23:59:59.999Z`;
};
