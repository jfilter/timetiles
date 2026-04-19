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
import { aliasedTable } from "@payloadcms/db-postgres/drizzle";

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
