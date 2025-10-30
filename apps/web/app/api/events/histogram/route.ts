/**
 * This file defines the API route for generating a temporal histogram of events.
 *
 * It accepts a set of filters (such as catalog, datasets, date range, and geographic bounds)
 * and uses a custom PostgreSQL function (`calculate_event_histogram`) to efficiently aggregate
 * event counts over a specified time interval (e.g., daily, weekly). This is used to power
 * the date histogram chart in the application, providing a performance-optimized way to
 * visualize the distribution of events over time.
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload, type Payload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";
import config from "@/payload.config";

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const isValidBounds = (value: unknown): value is MapBounds =>
  typeof value === "object" &&
  value != null &&
  typeof (value as Record<string, unknown>).north === "number" &&
  typeof (value as Record<string, unknown>).south === "number" &&
  typeof (value as Record<string, unknown>).east === "number" &&
  typeof (value as Record<string, unknown>).west === "number";

const parseBounds = (boundsParam: string): MapBounds => {
  const parsedBounds = JSON.parse(boundsParam) as unknown;
  if (!isValidBounds(parsedBounds)) {
    throw new Error("Invalid bounds format");
  }
  return parsedBounds;
};

/**
 * Get catalog IDs that the user has access to
 */
const getAccessibleCatalogIds = async (
  payload: Payload,
  user?: { id: string; email: string; role: string }
): Promise<number[]> => {
  try {
    const catalogs = await payload.find({
      collection: "catalogs",
      where: user
        ? {
            or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }],
          }
        : { isPublic: { equals: true } },
      limit: 1000,
      user,
      overrideAccess: false,
    });

    return catalogs.docs.map((c) => (typeof c.id === "number" ? c.id : parseInt(String(c.id))));
  } catch (error) {
    logger.warn("Error fetching accessible catalogs", { error });
    return [];
  }
};

const checkHistogramFunction = async (payload: Payload): Promise<boolean> => {
  try {
    const functionCheck = (await payload.db.drizzle.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'calculate_event_histogram'
      ) as exists
    `)) as { rows: Array<{ exists: boolean }> };
    return functionCheck.rows[0]?.exists ?? false;
  } catch (error) {
    logger.warn("Function check failed:", {
      error: (error as Error).message,
    });
    return false;
  }
};

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

export const GET = withOptionalAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });

    // Rate limiting check
    const rateLimitService = getRateLimitService(payload);
    const clientId = getClientIdentifier(request);
    const rateLimitCheck = rateLimitService.checkTrustLevelRateLimit(
      clientId,
      request.user as any,
      "API_GENERAL"
    );

    if (!rateLimitCheck.allowed) {
      const retryAfter = rateLimitCheck.resetTime
        ? Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)
        : 60;

      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const parameters = extractHistogramParameters(request.nextUrl.searchParams);
    const boundsResult = parseBoundsParameter(parameters.boundsParam);
    if ("error" in boundsResult) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAccessibleCatalogIds(payload, request.user);

    const functionExists = await checkHistogramFunction(payload);
    if (!functionExists) {
      return createFunctionNotFoundResponse();
    }

    const histogramResult = await executeHistogramQuery(payload, parameters, bounds, accessibleCatalogIds);
    const response = buildHistogramResponse(histogramResult.rows);

    return NextResponse.json(response);
  } catch (_error) {
    logError(_error, "Failed to calculate histogram", { parameters: _error });
    return NextResponse.json({ error: "Failed to calculate histogram" }, { status: 500 });
  }
});

const extractHistogramParameters = (searchParams: URLSearchParams) => ({
  boundsParam: searchParams.get("bounds"),
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
  granularity: searchParams.get("granularity") ?? "auto",
});

const parseBoundsParameter = (boundsParam: string | null): { bounds: MapBounds | null } | { error: NextResponse } => {
  if (boundsParam == null || boundsParam === "") {
    return { bounds: null };
  }

  try {
    return { bounds: parseBounds(boundsParam) };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid bounds format. Expected: {north, south, east, west}" },
        { status: 400 }
      ),
    };
  }
};

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

  const interval = parameters.granularity === "auto" ? "day" : parameters.granularity;

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${interval}::text,
      ${JSON.stringify(filtersWithBounds)}::jsonb
    )
  `)) as { rows: Array<{ bucket: string; event_count: number }> };
};

const buildHistogramResponse = (rows: Array<{ bucket: string; event_count: number }>) => {
  const total = rows.reduce((sum: number, row) => sum + parseInt(String(row.event_count), 10), 0);
  const aggregations = {
    total,
    dateRange: {
      min: rows[0]?.bucket ?? null,
      max: rows[rows.length - 1]?.bucket ?? null,
    },
  };

  const histogram = rows.map((row) => ({
    date: row.bucket,
    count: parseInt(String(row.event_count), 10),
  }));

  return {
    histogram,
    metadata: {
      total: aggregations.total,
      dateRange: aggregations.dateRange,
      counts: { datasets: 0, catalogs: 0 },
      topDatasets: [],
      topCatalogs: [],
    },
  };
};
