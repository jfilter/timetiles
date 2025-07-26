import { sql } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
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

export const GET = async (request: NextRequest) => {
  try {
    const payload = await getPayload({ config });
    const parameters = extractRequestParameters(request.nextUrl.searchParams);

    const boundsResult = parseBounds(parameters.boundsParam);
    if ("error" in boundsResult) {
      return boundsResult.error;
    }

    const filters = buildFilters(parameters);
    const functionExists = await checkClusteringFunction(payload);

    if (!functionExists) {
      return createFunctionNotFoundResponse();
    }

    const result = await executeClusteringQuery(payload, boundsResult.bounds, parameters.zoom, filters);
    const clusters = transformResultToClusters(result.rows);

    return NextResponse.json({
      type: "FeatureCollection",
      features: clusters,
    });
  } catch (error) {
    return handleError(error);
  }
};

const extractRequestParameters = (searchParams: URLSearchParams) => ({
  boundsParam: searchParams.get("bounds"),
  zoom: parseInt(searchParams.get("zoom") ?? "10", 10),
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
});

const parseBounds = (boundsParam: string | null): { bounds: MapBounds } | { error: NextResponse } => {
  if (boundsParam == null) {
    return {
      error: NextResponse.json({ error: "Missing bounds parameter" }, { status: 400 }),
    };
  }

  try {
    const parsedBounds = JSON.parse(boundsParam) as unknown;
    if (!isValidBounds(parsedBounds)) {
      throw new Error("Invalid bounds format");
    }
    return { bounds: parsedBounds };
  } catch {
    return {
      error: NextResponse.json(
        {
          error: "Invalid bounds format. Expected: {north, south, east, west}",
        },
        { status: 400 },
      ),
    };
  }
};

const buildFilters = (parameters: ReturnType<typeof extractRequestParameters>): Record<string, unknown> => {
  const filters: Record<string, unknown> = {};
  if (parameters.catalog != null) filters.catalog = parameters.catalog;
  if (parameters.datasets.length > 0 && parameters.datasets[0] !== "") filters.datasets = parameters.datasets;
  if (parameters.startDate != null) filters.startDate = parameters.startDate;
  if (parameters.endDate != null) filters.endDate = parameters.endDate;
  return filters;
};

const checkClusteringFunction = async (payload: Awaited<ReturnType<typeof getPayload>>): Promise<boolean> => {
  try {
    const functionCheck = (await payload.db.drizzle.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'cluster_events'
      ) as exists
    `)) as { rows: Array<{ exists: boolean }> };
    const functionExists = functionCheck.rows[0]?.exists ?? false;
    logger.debug("Clustering function check - exists:", { functionExists });
    return functionExists;
  } catch (error) {
    logger.warn("Function check failed:", {
      error: (error as Error).message,
    });
    return false;
  }
};

const createFunctionNotFoundResponse = (): NextResponse => {
  logger.error("Required cluster_events function not found in database");
  return NextResponse.json(
    {
      error: "Database function cluster_events not found. Please ensure migrations are run.",
      code: "MISSING_DB_FUNCTION",
    },
    { status: 500 },
  );
};

const executeClusteringQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  bounds: MapBounds,
  zoom: number,
  filters: Record<string, unknown>,
) => {
  const { catalog, datasets, startDate, endDate } = filters;

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events(
      ${bounds.west}::double precision,
      ${bounds.south}::double precision,
      ${bounds.east}::double precision,
      ${bounds.north}::double precision,
      ${zoom}::integer,
      ${JSON.stringify({
        catalogId: catalog != null ? parseInt(catalog as string) : undefined,
        datasetId:
          Array.isArray(datasets) && datasets.length === 1 && datasets[0] != undefined
            ? parseInt(datasets[0] as string)
            : undefined,
        startDate,
        endDate,
      })}::jsonb
    )
  `)) as { rows: Array<Record<string, unknown>> };
};

const transformResultToClusters = (rows: Array<Record<string, unknown>>) =>
  rows.map((row: Record<string, unknown>) => {
    const isCluster = Number(row.event_count) > 1;

    if (isCluster) {
      logger.debug("Cluster found:", { row });
    }

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          parseFloat(
            typeof row.longitude === "string" || typeof row.longitude === "number" ? String(row.longitude) : "0",
          ),
          parseFloat(typeof row.latitude === "string" || typeof row.latitude === "number" ? String(row.latitude) : "0"),
        ],
      },
      properties: {
        id: row.cluster_id ?? row.event_id,
        type: isCluster ? "event-cluster" : "event-point",
        ...(isCluster ? { count: Number(row.event_count) } : {}),
        ...(row.event_title != null && typeof row.event_title === "string" ? { title: row.event_title } : {}),
        ...(row.event_ids != null && Number(row.event_count) <= 10 ? { eventIds: row.event_ids } : {}),
      },
    };
  });

const handleError = (error: unknown): NextResponse => {
  logger.error("Error fetching map clusters:", {
    error: error as Error,
    message: (error as Error).message,
    stack: (error as Error).stack,
  });
  return NextResponse.json(
    {
      error: "Failed to fetch map clusters",
      details: (error as Error).message,
    },
    { status: 500 },
  );
};
