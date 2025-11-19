/**
 * This file defines the API route for generating a temporal histogram of events.
 *
 * It accepts a set of filters (such as catalog, datasets, date range, and geographic bounds)
 * and uses a custom PostgreSQL function (`calculate_event_histogram`) to efficiently
 * aggregate event counts with flexible bucket sizing. Users can specify a target bucket count
 * range (min/max), and the function automatically calculates the optimal bucket size.
 *
 * This is used to power the date histogram chart in the application, providing a
 * performance-optimized way to visualize the distribution of events over time.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { checkDatabaseFunction } from "@/lib/database/functions";
import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { type MapBounds, parseBoundsParameter } from "@/lib/geospatial";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

const buildFiltersWithBounds = (params: {
  catalog: string | null;
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
  bounds: MapBounds | null;
  accessibleCatalogIds: number[];
}) => {
  const filters: Record<string, unknown> = {
    datasets: params.datasets.length > 0 ? params.datasets.map((d) => parseInt(d)) : undefined,
    startDate: params.startDate,
    endDate: params.endDate,
    ...(params.bounds != null && {
      bounds: {
        minLng: params.bounds.west,
        maxLng: params.bounds.east,
        minLat: params.bounds.south,
        maxLat: params.bounds.north,
      },
    }),
  };

  // Apply catalog access control
  if (params.catalog != null && params.catalog !== "") {
    const catalogId = parseInt(params.catalog);
    // Only include if user has access to this catalog
    if (params.accessibleCatalogIds.includes(catalogId)) {
      filters.catalogId = catalogId;
    } else {
      // User trying to access catalog they don't have permission for
      filters.catalogIds = params.accessibleCatalogIds;
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    filters.catalogIds = params.accessibleCatalogIds;
  }

  return filters;
};

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractHistogramParameters(request.nextUrl.searchParams);
    const boundsResult = parseBoundsParameter(parameters.boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    const functionExists = await checkDatabaseFunction(payload, "calculate_event_histogram");
    if (!functionExists) {
      return createFunctionNotFoundResponse();
    }

    const histogramResult = await executeHistogramQuery(payload, parameters, bounds, accessibleCatalogIds);
    const response = buildHistogramResponse(histogramResult.rows);

    return NextResponse.json(response);
  } catch (_error) {
    logError(_error, "Failed to calculate histogram", { parameters: _error });
    return internalError("Failed to calculate histogram");
  }
});

const extractHistogramParameters = (searchParams: URLSearchParams) => ({
  boundsParam: searchParams.get("bounds"),
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
  // Flexible bucketing parameters
  targetBuckets: parseInt(searchParams.get("targetBuckets") ?? "30", 10),
  minBuckets: parseInt(searchParams.get("minBuckets") ?? "20", 10),
  maxBuckets: parseInt(searchParams.get("maxBuckets") ?? "50", 10),
});

const createFunctionNotFoundResponse = (): NextResponse => {
  logger.error("Required calculate_event_histogram function not found in database");
  return NextResponse.json(
    {
      error: "Database function calculate_event_histogram not found. Please ensure migrations are run.",
      code: "MISSING_DB_FUNCTION",
    },
    { status: 500 }
  );
};

const executeHistogramQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  parameters: ReturnType<typeof extractHistogramParameters>,
  bounds: MapBounds | null,
  accessibleCatalogIds: number[]
) => {
  const filtersWithBounds = buildFiltersWithBounds({
    catalog: parameters.catalog,
    datasets: parameters.datasets,
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    bounds,
    accessibleCatalogIds,
  });

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${JSON.stringify(filtersWithBounds)}::jsonb,
      ${parameters.targetBuckets}::integer,
      ${parameters.minBuckets}::integer,
      ${parameters.maxBuckets}::integer
    )
  `)) as {
    rows: Array<{
      bucket_start: string;
      bucket_end: string;
      bucket_size_seconds: number;
      event_count: number;
    }>;
  };
};

const buildHistogramResponse = (
  rows: Array<{
    bucket_start: string;
    bucket_end: string;
    bucket_size_seconds: number;
    event_count: number;
  }>
) => {
  const total = rows.reduce((sum: number, row) => sum + parseInt(String(row.event_count), 10), 0);

  const histogram = rows.map((row) => ({
    date: new Date(row.bucket_start).getTime(), // Bucket start timestamp
    dateEnd: new Date(row.bucket_end).getTime(), // Bucket end timestamp
    count: parseInt(String(row.event_count), 10),
  }));

  return {
    histogram,
    metadata: {
      total,
      dateRange: {
        min: rows[0]?.bucket_start ?? null,
        max: rows[rows.length - 1]?.bucket_end ?? null,
      },
      bucketSizeSeconds: rows[0]?.bucket_size_seconds ?? null,
      bucketCount: rows.length,
      counts: { datasets: 0, catalogs: 0 },
      topDatasets: [],
      topCatalogs: [],
    },
  };
};
