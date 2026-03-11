/**
 * Unified API route for aggregating event counts by various fields.
 *
 * Returns event counts grouped by a specified field (catalog, dataset, etc.)
 * with optional filtering by date range and geographic bounds. Uses PostgreSQL
 * GROUP BY aggregation for high performance.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { AggregateQuerySchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { type AggregationFilters, normalizeEndDate } from "@/lib/services/aggregation-filters";
import { executeAggregationQuery } from "@/lib/services/aggregation-service";

/**
 * GET handler for event aggregation.
 *
 * Query Parameters:
 * - groupBy (required): Field to group by ('catalog' | 'dataset')
 * - catalog (optional): Filter by catalog ID
 * - datasets (optional): Filter by dataset IDs (comma-separated)
 * - startDate (optional): Filter events >= this date
 * - endDate (optional): Filter events <= this date (inclusive)
 * - bounds (optional): Geographic bounding box (JSON string)
 */
export const GET = apiRoute({
  auth: "optional",
  query: AggregateQuerySchema,
  handler: async ({ query, user, payload }) => {
    const { groupBy } = query;

    // Get accessible catalog IDs for access control
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user ?? null);

    // If no accessible catalogs, return empty result
    if (accessibleCatalogIds.length === 0 && query.catalog == null) {
      logger.info({ user: user?.email ?? "anonymous" }, "No accessible catalogs for user");
      return Response.json({ items: [], total: 0, groupedBy: groupBy });
    }

    // Build filters object directly from Zod-validated query
    const filters: AggregationFilters = {
      catalog: query.catalog,
      datasets: query.datasets,
      startDate: query.startDate ?? null,
      endDate: normalizeEndDate(query.endDate ?? null),
      bounds: query.bounds ?? null,
      fieldFilters: Object.keys(query.ff).length > 0 ? query.ff : null,
    };

    // Execute aggregation query
    const result = await executeAggregationQuery(payload, groupBy, filters, accessibleCatalogIds);

    return Response.json(result);
  },
});
