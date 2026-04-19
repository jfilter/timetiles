/**
 * Shared Drizzle scopes for filtered event queries.
 *
 * Provides aliased tables named `e`, `d`, and `c` so the canonical SQL filter
 * adapter can be reused inside Drizzle builders without hand-written query
 * strings in each route.
 *
 * @module
 * @category Database
 */
import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { aliasedTable, and, count, inArray, isNotNull, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { catalogs, datasets, events } from "@/payload-generated-schema";

export const createFilteredEventDatasetScope = (filters: CanonicalEventFilters) => {
  const eventTable = aliasedTable(events, "e");
  const datasetTable = aliasedTable(datasets, "d");

  return { eventTable, datasetTable, whereClause: toSqlWhereClause(filters) };
};

export const createFilteredEventCatalogScope = (filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, whereClause } = createFilteredEventDatasetScope(filters);
  const catalogTable = aliasedTable(catalogs, "c");

  return { eventTable, datasetTable, catalogTable, whereClause };
};

export const createFilteredLocatedEventDatasetScope = (filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, whereClause } = createFilteredEventDatasetScope(filters);

  return { eventTable, datasetTable, whereClause: and(isNotNull(eventTable.location_longitude), whereClause)! };
};

export const createFilteredLocatedEventCatalogScope = (filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, catalogTable, whereClause } = createFilteredEventCatalogScope(filters);

  return {
    eventTable,
    datasetTable,
    catalogTable,
    whereClause: and(isNotNull(eventTable.location_longitude), whereClause)!,
  };
};

export const toCountRecord = <T extends { id: number | null; count: number | string }>(
  rows: T[]
): Record<string, number> =>
  rows.reduce<Record<string, number>>((acc, row) => {
    if (row.id != null) {
      acc[String(row.id)] = Number(row.count);
    }
    return acc;
  }, {});

export const fetchDatasetEventCounts = async (payload: Payload, datasetIds: number[]) => {
  if (datasetIds.length === 0) {
    return new Map<number, number>();
  }

  const rows = await payload.db.drizzle
    .select({ datasetId: events.dataset, count: count() })
    .from(events)
    .where(inArray(events.dataset, datasetIds))
    .groupBy(events.dataset);

  return rows.reduce<Map<number, number>>((acc, row) => {
    if (row.datasetId != null) {
      acc.set(Number(row.datasetId), Number(row.count));
    }
    return acc;
  }, new Map<number, number>());
};

export const buildClusterFilterClause = (
  baseWhereClause: SQL<unknown>,
  cellCondition: SQL<unknown>,
  eventTable: typeof events
) => and(baseWhereClause, isNotNull(eventTable.location_longitude), cellCondition)!;

export const buildClusterPreviewTitle = (eventTable: typeof events) =>
  sql<string | null>`(${eventTable.transformedData}->>'title')::text`;
