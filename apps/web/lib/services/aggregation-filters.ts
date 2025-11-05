/**
 * Shared filter building utilities for event aggregation queries.
 *
 * Provides reusable functions to build SQL WHERE clauses from filter parameters,
 * ensuring consistent access control and filter application across all aggregation
 * endpoints.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";

import type { SimpleBounds } from "@/lib/hooks/use-events-queries";

/**
 * Filter parameters for event aggregation.
 */
export interface AggregationFilters {
  /** Catalog ID to filter by (with access control) */
  catalog?: string | null;
  /** Dataset IDs to filter by (comma-separated) */
  datasets?: string[] | null;
  /** Start date for event timestamp filter (inclusive) */
  startDate?: string | null;
  /** End date for event timestamp filter (inclusive to end of day) */
  endDate?: string | null;
  /** Geographic bounding box for location filtering */
  bounds?: SimpleBounds | null;
}

/**
 * Build SQL WHERE clause fragments from filter parameters.
 *
 * Generates SQL conditions for filtering events based on catalog, datasets,
 * date range, and geographic bounds. Always enforces access control by
 * restricting results to accessible catalog IDs.
 *
 * @param filters - Filter parameters from request
 * @param accessibleCatalogIds - Catalog IDs the user has permission to access
 * @returns SQL WHERE clause fragment
 *
 * @example
 * ```typescript
 * const filters = {
 *   catalog: "1",
 *   datasets: ["5", "6"],
 *   startDate: "2024-01-01",
 *   endDate: "2024-12-31",
 *   bounds: { north: 37.8, south: 37.7, east: -122.4, west: -122.5 }
 * };
 * const whereClause = buildAggregationWhereClause(filters, [1, 2, 3]);
 * ```
 */
export const buildAggregationWhereClause = (
  filters: AggregationFilters,
  accessibleCatalogIds: number[]
): ReturnType<typeof sql.join> => {
  const clauses: ReturnType<typeof sql>[] = [];

  // 1. Access Control (ALWAYS REQUIRED)
  // Never allow queries without access control filtering
  if (filters.catalog != null && filters.catalog !== "") {
    const catalogId = parseInt(filters.catalog);
    // Only apply catalog filter if user has access to it
    if (accessibleCatalogIds.includes(catalogId)) {
      clauses.push(sql`d.catalog_id = ${catalogId}`);
    } else {
      // User trying to access catalog they don't have permission for
      // Fall back to all accessible catalogs instead
      if (accessibleCatalogIds.length > 0) {
        clauses.push(
          sql`d.catalog_id IN (${sql.join(
            accessibleCatalogIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      } else {
        // No accessible catalogs - query will return empty result
        clauses.push(sql`FALSE`);
      }
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    if (accessibleCatalogIds.length > 0) {
      clauses.push(
        sql`d.catalog_id IN (${sql.join(
          accessibleCatalogIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    } else {
      // No accessible catalogs - query will return empty result
      clauses.push(sql`FALSE`);
    }
  }

  // 2. Dataset Filter (OPTIONAL)
  if (filters.datasets && filters.datasets.length > 0) {
    const datasetIds = filters.datasets.map((d) => parseInt(d)).filter((id) => !isNaN(id));
    if (datasetIds.length > 0) {
      clauses.push(
        sql`e.dataset_id IN (${sql.join(
          datasetIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    }
  }

  // 3. Start Date Filter (OPTIONAL)
  if (filters.startDate) {
    clauses.push(sql`e.event_timestamp >= ${filters.startDate}::timestamp`);
  }

  // 4. End Date Filter (OPTIONAL)
  // Note: The calling code should append T23:59:59.999Z to endDate for end-of-day inclusivity
  if (filters.endDate) {
    clauses.push(sql`e.event_timestamp <= ${filters.endDate}::timestamp`);
  }

  // 5. Geographic Bounds Filter (OPTIONAL)
  if (filters.bounds) {
    clauses.push(sql`e.location_latitude >= ${filters.bounds.south}`);
    clauses.push(sql`e.location_latitude <= ${filters.bounds.north}`);
    clauses.push(sql`e.location_longitude >= ${filters.bounds.west}`);
    clauses.push(sql`e.location_longitude <= ${filters.bounds.east}`);
  }

  // Combine all clauses with AND
  return sql.join(clauses, sql` AND `);
};

/**
 * Parse comma-separated dataset IDs from query parameter.
 *
 * @param datasetsParam - Comma-separated dataset IDs (e.g., "1,2,3")
 * @returns Array of dataset ID strings, or empty array if none
 */
export const parseDatasetIds = (datasetsParam: string | null): string[] => {
  if (!datasetsParam) return [];
  return datasetsParam.split(",").filter(Boolean);
};

/**
 * Normalize end date to include full day (23:59:59.999).
 *
 * Ensures that date range filtering includes events from the entire end date,
 * not just midnight of that day.
 *
 * @param endDate - ISO date string (e.g., "2024-12-31")
 * @returns ISO datetime string with time set to end of day, or null if input is null
 *
 * @example
 * ```typescript
 * normalizeEndDate("2024-12-31")
 * // Returns: "2024-12-31T23:59:59.999Z"
 * ```
 */
export const normalizeEndDate = (endDate: string | null): string | null => {
  if (!endDate) return null;
  // Check if it already includes time component
  if (endDate.includes("T")) return endDate;
  // Append end-of-day time
  return `${endDate}T23:59:59.999Z`;
};
