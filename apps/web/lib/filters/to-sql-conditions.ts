/**
 * SQL output adapter for canonical event filters.
 *
 * Converts {@link CanonicalEventFilters} to Drizzle SQL fragments for
 * use in raw PostgreSQL queries.
 *
 * @module
 * @category Filters
 */
import { sql } from "@payloadcms/db-postgres";

import type { CanonicalBounds, CanonicalEventFilters } from "./canonical-event-filters";
import { isValidFieldKey } from "./field-validation";

type SqlFragment = ReturnType<typeof sql>;

/**
 * Convert canonical filters to an array of SQL condition fragments.
 *
 * Each fragment is a standalone condition (no leading AND).
 * Caller is responsible for combining them.
 */
export const toSqlConditions = (filters: CanonicalEventFilters): SqlFragment[] => {
  if (filters.denyResults) {
    return [sql`FALSE`];
  }

  const conditions: SqlFragment[] = [];

  // Catalog access control
  conditions.push(buildCatalogCondition(filters.catalogId, filters.catalogIds));

  // Datasets
  const datasetCondition = buildDatasetCondition(filters.datasets);
  if (datasetCondition) conditions.push(datasetCondition);

  // Dates (standardized on ::timestamptz)
  conditions.push(...buildDateConditions(filters.startDate, filters.endDate));

  // Bounds (with anti-meridian support)
  if (filters.bounds) {
    conditions.push(...buildBoundsConditions(filters.bounds));
  }

  // Field filters (keys already validated by canonical builder, re-validate for defense-in-depth)
  conditions.push(...buildFieldFilterConditions(filters.fieldFilters));

  return conditions;
};

/**
 * Convert canonical filters to a single SQL WHERE clause.
 *
 * Joins all conditions with AND. Returns `TRUE` if no conditions.
 */
export const toSqlWhereClause = (filters: CanonicalEventFilters): SqlFragment => {
  const conditions = toSqlConditions(filters);
  if (conditions.length === 0) return sql`TRUE`;
  return sql.join(conditions, sql` AND `);
};

// --- Internal builders ---

const buildCatalogCondition = (catalogId?: number, catalogIds?: number[]): SqlFragment => {
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

const buildDatasetCondition = (datasets?: number[]): SqlFragment | null => {
  if (!datasets || datasets.length === 0) return null;
  return sql`e.dataset_id IN (${sql.join(
    datasets.map((id) => sql`${id}`),
    sql`, `
  )})`;
};

const buildDateConditions = (startDate?: string | null, endDate?: string | null): SqlFragment[] => {
  const conditions: SqlFragment[] = [];
  if (startDate != null) conditions.push(sql`e.event_timestamp >= ${startDate}::timestamptz`);
  if (endDate != null) conditions.push(sql`e.event_timestamp <= ${endDate}::timestamptz`);
  return conditions;
};

const buildBoundsConditions = (bounds: CanonicalBounds): SqlFragment[] => {
  const conditions: SqlFragment[] = [
    sql`e.location_latitude >= ${bounds.south}`,
    sql`e.location_latitude <= ${bounds.north}`,
  ];

  // Handle anti-meridian crossing
  if (bounds.west <= bounds.east) {
    conditions.push(sql`e.location_longitude >= ${bounds.west} AND e.location_longitude <= ${bounds.east}`);
  } else {
    conditions.push(sql`(e.location_longitude >= ${bounds.west} OR e.location_longitude <= ${bounds.east})`);
  }

  return conditions;
};

const buildFieldFilterConditions = (fieldFilters?: Record<string, string[]>): SqlFragment[] => {
  if (!fieldFilters) return [];

  const conditions: SqlFragment[] = [];
  for (const [fieldKey, values] of Object.entries(fieldFilters)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    // Defense-in-depth: re-validate even though sanitizeFieldFilters ran at construction
    if (!isValidFieldKey(fieldKey)) continue;
    conditions.push(
      sql`(e.data #>> string_to_array(${fieldKey}, '.')) IN (${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `
      )})`
    );
  }
  return conditions;
};
