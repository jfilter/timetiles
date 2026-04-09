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
  conditions.push(...buildFieldFilterConditions(filters.fieldFilters, filters.tagFields));

  // H3 cell filter (precise spatial filter by pre-computed H3 columns)
  const h3Condition = buildH3CellCondition(filters.clusterCells, filters.h3Resolution);
  if (h3Condition) conditions.push(h3Condition);

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

export const buildFieldFilterConditions = (
  fieldFilters?: Record<string, string[]>,
  tagFields?: Set<string>
): SqlFragment[] => {
  if (!fieldFilters) return [];

  const conditions: SqlFragment[] = [];
  for (const [fieldKey, values] of Object.entries(fieldFilters)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    // Defense-in-depth: re-validate even though sanitizeFieldFilters ran at construction
    if (!isValidFieldKey(fieldKey)) continue;

    if (tagFields?.has(fieldKey)) {
      // Tag/array fields: match events whose array contains ANY of the selected values.
      // Uses @> (contains) with OR for each value: (arr @> '["v1"]' OR arr @> '["v2"]')
      const containsClauses = values.map((value) => {
        const jsonbLiteral = JSON.stringify([value]);
        return sql`e.transformed_data -> ${fieldKey} @> ${jsonbLiteral}::jsonb`;
      });
      const combined = sql.join(containsClauses, sql` OR `);
      conditions.push(sql`(${combined})`);
    } else {
      // Scalar fields: exact text match via IN
      conditions.push(
        sql`(e.transformed_data #>> string_to_array(${fieldKey}, '.')) IN (${sql.join(
          values.map((value) => sql`${value}`),
          sql`, `
        )})`
      );
    }
  }
  return conditions;
};

/** Validate H3 cell ID format (15 hex characters). */
const isValidH3CellId = (cell: string): boolean => /^[0-9a-fA-F]{15}$/.test(cell);

/** Filter events by pre-computed H3 cell column at the given resolution. */
const buildH3CellCondition = (clusterCells?: string[], h3Resolution?: number): SqlFragment | null => {
  if (!clusterCells || clusterCells.length === 0 || h3Resolution == null) return null;
  // Validate resolution range (columns h3_r2 through h3_r15 exist)
  const res = Math.min(15, Math.max(2, Math.round(h3Resolution)));
  const col = "e.h3_r" + String(res);
  // Validate and filter cell IDs to prevent SQL injection
  const validCells = clusterCells.filter(isValidH3CellId);
  if (validCells.length === 0) return null;
  const escaped = validCells.map((c) => "'" + c + "'").join(", ");
  return sql.raw(col + "::text IN (" + escaped + ")");
};
