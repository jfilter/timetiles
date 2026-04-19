/**
 * Service for executing event aggregation queries.
 *
 * Uses PostgreSQL GROUP BY aggregation for high-performance event counting
 * by catalog or dataset, with support for temporal, spatial, and field filters.
 *
 * @module
 * @category Services
 */
import { count, desc, eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { createFilteredEventCatalogScope, createFilteredEventDatasetScope } from "@/lib/database/filtered-events-query";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { logger } from "@/lib/logger";
import type { AggregateResponse, AggregationItem } from "@/lib/schemas/events";
import type { User } from "@/payload-types";

/**
 * Supported groupBy field types.
 */
export type GroupByField = "catalog" | "dataset";

/**
 * Execute PostgreSQL aggregation query.
 *
 * Uses GROUP BY to aggregate event counts by the specified field,
 * applying all filters in the WHERE clause for optimal performance.
 *
 * When datasets are explicitly filtered, ensures all selected datasets
 * appear in results (with 0 count if no events match in viewport).
 */
export const executeAggregationQuery = async (
  payload: Payload,
  groupBy: GroupByField,
  filters: CanonicalEventFilters,
  user?: User | null
): Promise<AggregateResponse> => {
  const queryResult =
    groupBy === "catalog"
      ? await executeCatalogAggregation(payload, filters)
      : await executeDatasetAggregation(payload, filters);

  // Transform results into a map for easy lookup
  const resultMap = new Map<number, AggregationItem>();
  for (const row of queryResult) {
    if (row.id == null) continue;
    resultMap.set(row.id, {
      id: row.id,
      name: row.name ?? `${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} ${row.id}`,
      count: Number(row.count),
    });
  }

  // If datasets are explicitly filtered, ensure all selected datasets appear in results
  // (even with 0 count if they have no events in viewport)
  if (groupBy === "dataset" && filters.datasets && filters.datasets.length > 0) {
    const selectedDatasetIds = filters.datasets;

    // Fetch dataset names for any missing datasets
    const missingDatasetIds = selectedDatasetIds.filter((id) => !resultMap.has(id));

    if (missingDatasetIds.length > 0) {
      const missingDatasetsResult = await payload.find({
        collection: "datasets",
        where: { id: { in: missingDatasetIds } },
        limit: missingDatasetIds.length,
        select: { name: true },
        user,
        overrideAccess: false,
      });

      // Add missing datasets with 0 count
      for (const row of missingDatasetsResult.docs) {
        resultMap.set(row.id, { id: row.id, name: row.name ?? `Dataset ${row.id}`, count: 0 });
      }
    }
  }

  // Convert map to array, sorted by count descending (0-count items at the end)
  const items = Array.from(resultMap.values()).sort((a, b) => b.count - a.count);

  // Calculate total events
  const total = items.reduce((sum, item) => sum + item.count, 0);

  logger.info({ groupBy, itemCount: items.length, totalEvents: total }, "Aggregation query executed");

  return { items, total, groupedBy: groupBy };
};

const executeCatalogAggregation = async (payload: Payload, filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, catalogTable, whereClause } = createFilteredEventCatalogScope(filters);

  return payload.db.drizzle
    .select({ id: datasetTable.catalog, name: catalogTable.name, count: count() })
    .from(eventTable)
    .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
    .innerJoin(catalogTable, eq(datasetTable.catalog, catalogTable.id))
    .where(whereClause)
    .groupBy(datasetTable.catalog, catalogTable.name)
    .orderBy(desc(count()));
};

const executeDatasetAggregation = async (payload: Payload, filters: CanonicalEventFilters) => {
  const { eventTable, datasetTable, whereClause } = createFilteredEventDatasetScope(filters);

  return payload.db.drizzle
    .select({ id: eventTable.dataset, name: datasetTable.name, count: count() })
    .from(eventTable)
    .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
    .where(whereClause)
    .groupBy(eventTable.dataset, datasetTable.name)
    .orderBy(desc(count()));
};
