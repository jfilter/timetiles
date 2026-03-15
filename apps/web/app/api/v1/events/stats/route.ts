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
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { AggregateQuerySchema } from "@/lib/schemas/events";
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

    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return { items: [], total: 0, groupedBy: groupBy };
    }

    return executeAggregationQuery(payload, groupBy, ctx.filters, ctx.accessibleCatalogIds);
  },
});
