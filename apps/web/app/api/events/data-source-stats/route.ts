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
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

/**
 * Response format for data source stats endpoint.
 */
interface DataSourceStatsResponse {
  catalogCounts: Record<string, number>;
  datasetCounts: Record<string, number>;
  totalEvents: number;
}

/**
 * GET handler for data source statistics.
 *
 * Returns event counts for all accessible catalogs and datasets.
 * This data is used to display total event counts in the filter UI,
 * helping users understand the size of each data source before selecting it.
 */
export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    // Get accessible catalog IDs for access control
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user ?? null);

    // If no accessible catalogs, return empty result
    if (accessibleCatalogIds.length === 0) {
      logger.info("No accessible catalogs for user", {
        user: request.user?.email ?? "anonymous",
      });
      return NextResponse.json({
        catalogCounts: {},
        datasetCounts: {},
        totalEvents: 0,
      });
    }

    // Build access control condition
    const catalogIdList = sql.join(accessibleCatalogIds, sql`, `);
    const accessCondition = accessibleCatalogIds.length > 0 ? sql`d.catalog_id IN (${catalogIdList})` : sql`1=0`;

    // Query event counts by catalog
    const catalogResult = (await payload.db.drizzle.execute(sql`
      SELECT
        d.catalog_id as id,
        COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${accessCondition}
      GROUP BY d.catalog_id
    `)) as {
      rows: Array<{ id: number; count: number }>;
    };

    // Query event counts by dataset
    const datasetResult = (await payload.db.drizzle.execute(sql`
      SELECT
        e.dataset_id as id,
        COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${accessCondition}
      GROUP BY e.dataset_id
    `)) as {
      rows: Array<{ id: number; count: number }>;
    };

    // Transform results to Record<string, number>
    const catalogCounts: Record<string, number> = {};
    for (const row of catalogResult.rows) {
      catalogCounts[String(row.id)] = row.count;
    }

    const datasetCounts: Record<string, number> = {};
    for (const row of datasetResult.rows) {
      datasetCounts[String(row.id)] = row.count;
    }

    // Calculate total events
    const totalEvents = Object.values(catalogCounts).reduce((sum, count) => sum + count, 0);

    logger.info("Data source stats fetched", {
      catalogCount: Object.keys(catalogCounts).length,
      datasetCount: Object.keys(datasetCounts).length,
      totalEvents,
    });

    const response: DataSourceStatsResponse = {
      catalogCounts,
      datasetCounts,
      totalEvents,
    };

    return NextResponse.json(response);
  } catch (error) {
    logError(error, "Failed to fetch data source stats");
    return internalError("Failed to fetch data source stats");
  }
});
