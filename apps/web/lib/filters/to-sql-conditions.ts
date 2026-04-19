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

  // Access control always applies, with optional catalog narrowing layered on top.
  conditions.push(buildEventAccessCondition(filters));

  const catalogCondition = buildCatalogCondition(filters.catalogId, filters.catalogIds);
  if (catalogCondition) conditions.push(catalogCondition);

  // Datasets
  const datasetCondition = buildDatasetCondition(filters.datasets);
  if (datasetCondition) conditions.push(datasetCondition);

  // Dates (standardized on ::timestamptz)
  conditions.push(...buildDateConditions(filters.startDate, filters.endDate));

  // Bounds (with anti-meridian support)
  if (filters.bounds) {
    conditions.push(...buildBoundsConditions(filters.bounds));
  }

  const locationCondition = buildRequireLocationCondition(filters.requireLocation);
  if (locationCondition) conditions.push(locationCondition);

  // Field filters (keys already validated by canonical builder, re-validate for defense-in-depth)
  conditions.push(...buildFieldFilterConditions(filters.fieldFilters, filters.tagFields));

  // H3 cell filter (precise spatial filter by pre-computed H3 columns)
  const h3Condition = buildH3CellSqlCondition(filters.clusterCells, filters.h3Resolution);
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

const buildCatalogCondition = (catalogId?: number, catalogIds?: number[]): SqlFragment | null => {
  if (catalogId != null) {
    return sql`d.catalog_id = ${catalogId}`;
  }
  if (catalogIds != null && catalogIds.length > 0) {
    return sql`d.catalog_id IN (${sql.join(
      catalogIds.map((id) => sql`${id}`),
      sql`, `
    )})`;
  }
  return null;
};

const buildEventAccessCondition = (filters: CanonicalEventFilters): SqlFragment => {
  const accessConditions: SqlFragment[] = [];

  if (filters.includePublic !== false) {
    accessConditions.push(sql`e.dataset_is_public = true`);
  }

  if (filters.ownerId != null) {
    accessConditions.push(sql`e.catalog_owner_id = ${filters.ownerId}`);
  }

  if (accessConditions.length === 0) {
    return sql`FALSE`;
  }

  if (accessConditions.length === 1) {
    return accessConditions[0]!;
  }

  const joinedAccessConditions = sql.join(accessConditions, sql` OR `);
  return sql.join([sql`(`, joinedAccessConditions, sql`)`], sql``);
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

const buildRequireLocationCondition = (requireLocation?: boolean): SqlFragment | null => {
  if (!requireLocation) return null;
  return sql`e.location_latitude IS NOT NULL AND e.location_longitude IS NOT NULL`;
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
export const isValidH3CellId = (cell: string): boolean => /^[0-9a-fA-F]{15}$/.test(cell);

/**
 * Clamp and format an H3 resolution into a valid column name.
 * Columns h3_r2 through h3_r15 exist in the events table.
 */
export const h3ColumnName = (h3Resolution: number, tableAlias = "e"): string => {
  const res = Math.min(15, Math.max(2, Math.round(h3Resolution)));
  return `${tableAlias}.h3_r${String(res)}`;
};

const EVENT_H3_COLUMNS: Record<number, SqlFragment> = {
  2: sql`e.h3_r2`,
  3: sql`e.h3_r3`,
  4: sql`e.h3_r4`,
  5: sql`e.h3_r5`,
  6: sql`e.h3_r6`,
  7: sql`e.h3_r7`,
  8: sql`e.h3_r8`,
  9: sql`e.h3_r9`,
  10: sql`e.h3_r10`,
  11: sql`e.h3_r11`,
  12: sql`e.h3_r12`,
  13: sql`e.h3_r13`,
  14: sql`e.h3_r14`,
  15: sql`e.h3_r15`,
};

const buildH3ColumnSql = (h3Resolution: number): SqlFragment => {
  const res = Math.min(15, Math.max(2, Math.round(h3Resolution)));
  return EVENT_H3_COLUMNS[res]!;
};

/** Filter events by pre-computed H3 cell column at the given resolution. */
export const buildH3CellSqlCondition = (clusterCells?: string[], h3Resolution?: number): SqlFragment | null => {
  if (!clusterCells || clusterCells.length === 0 || h3Resolution == null) return null;
  // Validate and filter cell IDs to prevent SQL injection
  const validCells = clusterCells.filter(isValidH3CellId);
  if (validCells.length === 0) return null;
  return sql`${buildH3ColumnSql(h3Resolution)}::text IN (${sql.join(
    validCells.map((c) => sql`${c}`),
    sql`, `
  )})`;
};
