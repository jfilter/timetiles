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
import { apiRoute } from "@/lib/api";
import { toCountRecord } from "@/lib/database/filtered-events-query";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { logger } from "@/lib/logger";
import { executeCatalogAggregation, executeDatasetAggregation } from "@/lib/services/aggregation-service";

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
    const [catalogRows, datasetRows] = await Promise.all([
      executeCatalogAggregation(payload, filters),
      executeDatasetAggregation(payload, filters),
    ]);
    const catalogCounts = toCountRecord(catalogRows);
    const datasetCounts = toCountRecord(datasetRows);

    // Calculate total events
    const totalEvents = Object.values(catalogCounts).reduce((sum, count) => sum + count, 0);

    logger.info(
      { catalogCount: Object.keys(catalogCounts).length, datasetCount: Object.keys(datasetCounts).length, totalEvents },
      "Data source stats fetched"
    );

    return { catalogCounts, datasetCounts, totalEvents };
  },
});
