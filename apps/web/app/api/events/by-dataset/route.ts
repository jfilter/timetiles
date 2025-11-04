/**
 * API route for aggregating event counts by dataset.
 *
 * Returns event counts grouped by dataset with optional filtering by
 * catalog, date range, and geographic bounds. Uses server-side aggregation
 * for better performance compared to client-side processing.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { parseBoundsParameter } from "@/lib/types/geo";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

interface DatasetCount {
  datasetId: number;
  datasetName: string;
  count: number;
}

interface ByDatasetResponse {
  datasets: DatasetCount[];
  total: number;
}

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });
    const { searchParams } = request.nextUrl;

    // Parse filters
    const catalog = searchParams.get("catalog");
    const datasetsParam = searchParams.get("datasets");
    const datasets = datasetsParam ? datasetsParam.split(",").filter(Boolean) : [];
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const boundsParam = searchParams.get("bounds");

    // Parse bounds
    const boundsResult = parseBoundsParameter(boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    // Build where clause for events
    const where: any = { and: [] };

    // Apply catalog access control
    if (catalog != null && catalog !== "") {
      const catalogId = parseInt(catalog);
      if (accessibleCatalogIds.includes(catalogId)) {
        where.and.push({
          "dataset.catalog": { equals: catalogId },
        });
      } else {
        // User trying to access catalog they don't have permission for
        where.and.push({
          "dataset.catalog": { in: accessibleCatalogIds },
        });
      }
    } else {
      // No specific catalog requested, filter by all accessible catalogs
      where.and.push({
        "dataset.catalog": { in: accessibleCatalogIds },
      });
    }

    // Apply dataset filter
    if (datasets.length > 0) {
      where.and.push({
        dataset: { in: datasets.map((d) => parseInt(d)) },
      });
    }

    // Apply date filters
    if (startDate) {
      where.and.push({
        eventTimestamp: { greater_than_equal: startDate },
      });
    }
    if (endDate) {
      where.and.push({
        eventTimestamp: { less_than_equal: `${endDate}T23:59:59.999Z` },
      });
    }

    // Apply bounds filter
    if (bounds) {
      where.and.push({
        "location.latitude": {
          greater_than_equal: bounds.south,
          less_than_equal: bounds.north,
        },
      });
      where.and.push({
        "location.longitude": {
          greater_than_equal: bounds.west,
          less_than_equal: bounds.east,
        },
      });
    }

    // Fetch events with dataset information
    const eventsResult = await payload.find({
      collection: "events",
      where: where.and.length > 0 ? where : {},
      depth: 1,
      limit: 100000, // High limit for aggregation
    });

    // Aggregate by dataset
    const datasetCounts = new Map<number, { name: string; count: number }>();

    eventsResult.docs.forEach((event) => {
      const dataset = event.dataset;
      if (typeof dataset === "object" && dataset != null) {
        const datasetId = dataset.id;
        const existing = datasetCounts.get(datasetId);
        if (existing) {
          existing.count++;
        } else {
          datasetCounts.set(datasetId, {
            name: dataset.name ?? `Dataset ${datasetId}`,
            count: 1,
          });
        }
      }
    });

    // Convert to array and sort by count descending
    const datasetsArray: DatasetCount[] = Array.from(datasetCounts.entries())
      .map(([datasetId, data]) => ({
        datasetId,
        datasetName: data.name,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count);

    const response: ByDatasetResponse = {
      datasets: datasetsArray,
      total: eventsResult.totalDocs,
    };

    logger.debug("Dataset aggregation completed", {
      env: process.env.NODE_ENV,
      datasetCount: datasetsArray.length,
      totalEvents: response.total,
    });

    return NextResponse.json(response);
  } catch (error) {
    logError(error, "Failed to aggregate events by dataset");
    return internalError();
  }
});
