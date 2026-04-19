/**
 * API route for fetching data source statistics.
 *
 * Returns event counts grouped by both catalog and dataset in a single request.
 * Used by the DataSourceSelector component to display total event counts
 * for each catalog and dataset without filters applied.
 *
 * @module
 * @category API
 */
import { count, eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import {
  createFilteredEventCatalogScope,
  createFilteredEventDatasetScope,
  toCountRecord,
} from "@/lib/database/filtered-events-query";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { logger } from "@/lib/logger";

export type { DataSourceStatsResponse } from "@/lib/types/data-source-stats";

/**
 * GET handler for data source statistics.
 *
 * Returns event counts for all accessible catalogs and datasets.
 * This data is used to display total event counts in the filter UI,
 * helping users understand the size of each data source before selecting it.
 */
export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user, payload }) => {
    const filters: CanonicalEventFilters = { includePublic: true, ...(user ? { ownerId: user.id } : {}) };
    const catalogCountsPromise = fetchCatalogCounts(payload, filters);
    const datasetCountsPromise = fetchDatasetCounts(payload, filters);
    const [catalogCounts, datasetCounts] = await Promise.all([catalogCountsPromise, datasetCountsPromise]);

    // Calculate total events
    const totalEvents = Object.values(catalogCounts).reduce((sum, count) => sum + count, 0);

    logger.info(
      { catalogCount: Object.keys(catalogCounts).length, datasetCount: Object.keys(datasetCounts).length, totalEvents },
      "Data source stats fetched"
    );

    return { catalogCounts, datasetCounts, totalEvents };
  },
});

const fetchCatalogCounts = async (payload: Payload, filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, catalogTable, whereClause } = createFilteredEventCatalogScope(filters);

  const rows = await payload.db.drizzle
    .select({ id: datasetTable.catalog, count: count() })
    .from(eventTable)
    .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
    .innerJoin(catalogTable, eq(datasetTable.catalog, catalogTable.id))
    .where(whereClause)
    .groupBy(datasetTable.catalog);

  return toCountRecord(rows);
};

const fetchDatasetCounts = async (payload: Payload, filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, whereClause } = createFilteredEventDatasetScope(filters);

  const rows = await payload.db.drizzle
    .select({ id: eventTable.dataset, count: count() })
    .from(eventTable)
    .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
    .where(whereClause)
    .groupBy(eventTable.dataset);

  return toCountRecord(rows);
};
