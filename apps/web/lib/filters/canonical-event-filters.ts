/**
 * Canonical filter model for event queries.
 *
 * Single source of truth for resolved, access-controlled, normalized
 * filter state. All event query paths (SQL, Payload, JSONB) consume
 * this interface via output adapters.
 *
 * @module
 * @category Filters
 */
import type { NumberFormat } from "@/lib/utils/number-parsing";

/**
 * Inclusive numeric range bound for a single field. Either end may be
 * `null`/`undefined` to express an open-ended range (min-only / max-only).
 */
export interface RangeFilter {
  min?: number | null;
  max?: number | null;
}

/**
 * Resolved event filters with access control applied and values normalized.
 */
export interface CanonicalEventFilters {
  /** Whether publicly visible events should be included in reads */
  includePublic?: boolean;
  /** Catalog owner ID for owner-visible reads */
  ownerId?: number;
  /** Single catalog ID when user requested a specific catalog and has access */
  catalogId?: number;
  /** Catalog IDs constrained by view scope or other explicit narrowing */
  catalogIds?: number[];
  /** Dataset IDs to filter by */
  datasets?: number[];
  /** Start date for temporal filtering (ISO 8601) */
  startDate?: string | null;
  /** End date for temporal filtering — always normalized with end-of-day */
  endDate?: string | null;
  /** Geographic bounds for spatial filtering */
  bounds?: CanonicalBounds | null;
  /** Only include events with geocoded locations */
  requireLocation?: boolean;
  /** Field filters for categorical filtering (keys always validated) */
  fieldFilters?: Record<string, string[]>;
  /** Fields that store arrays (tag/multi-value) — use JSONB containment instead of IN */
  tagFields?: Set<string>;
  /**
   * Numeric range filters keyed by validated field path. Single-dataset only —
   * resolved against exactly one dataset's number format (see {@link numberFormats}).
   */
  rangeFilters?: Record<string, RangeFilter>;
  /**
   * Per-field locale number convention used to normalize stored raw text into a
   * numeric value at query time (strip thousands sep, convert decimal sep to `.`).
   * Keyed by the SAME field path as {@link rangeFilters}; populated only after the
   * single dataset's interpretation plan resolves a number-kind column policy.
   */
  numberFormats?: Record<string, NumberFormat>;
  /** H3 cell IDs to restrict results to (precise spatial filter) */
  clusterCells?: string[];
  /** H3 resolution for clusterCells (2-13) */
  h3Resolution?: number;
  /** When true, filters are valid but should match no rows (access denied) */
  denyResults?: boolean;
}

/**
 * Geographic bounding box in {north, south, east, west} format.
 */
export interface CanonicalBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}
