/**
 * Shared SQL condition builders for event API routes.
 *
 * These functions generate SQL fragments for common filter patterns
 * used across bounds, geo/stats, and other event endpoints.
 *
 * @module
 * @category Utils
 */
import { sql } from "@payloadcms/db-postgres";

type SqlFragment = ReturnType<typeof sql>;

/**
 * Build SQL condition for catalog filtering.
 * Returns a bare condition (no AND prefix) for use in WHERE clauses.
 */
export const buildCatalogSqlCondition = (catalogId?: number, catalogIds?: number[]): SqlFragment => {
  if (catalogId != null) {
    return sql`d.catalog_id = ${catalogId}`;
  }
  if (catalogIds != null && catalogIds.length > 0) {
    return sql`d.catalog_id IN (${sql.join(
      catalogIds.map((id) => sql`${id}`),
      sql`, `
    )})`;
  }
  return sql`FALSE`;
};

/**
 * Build SQL conditions for field filters (JSON path-based filtering).
 * Returns an array of bare conditions.
 */
export const buildFieldFilterSqlConditions = (fieldFilters?: Record<string, string[]>): SqlFragment[] => {
  if (!fieldFilters) return [];

  const conditions: SqlFragment[] = [];
  for (const [fieldKey, values] of Object.entries(fieldFilters)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    conditions.push(
      sql`(e.data #>> string_to_array(${fieldKey}, '.')) IN (${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `
      )})`
    );
  }
  return conditions;
};

/**
 * Build SQL condition for dataset filtering.
 * Returns null if no dataset filter is needed.
 */
export const buildDatasetSqlCondition = (datasetIds?: number[]): SqlFragment | null => {
  if (!datasetIds || datasetIds.length === 0) return null;
  return sql`e.dataset_id IN (${sql.join(
    datasetIds.map((id) => sql`${id}`),
    sql`, `
  )})`;
};

/**
 * Build SQL conditions for date range filtering.
 */
export const buildDateSqlConditions = (startDate?: string | null, endDate?: string | null): SqlFragment[] => {
  const conditions: SqlFragment[] = [];
  if (startDate != null) conditions.push(sql`e.event_timestamp >= ${startDate}::timestamptz`);
  if (endDate != null) conditions.push(sql`e.event_timestamp <= ${endDate}::timestamptz`);
  return conditions;
};
