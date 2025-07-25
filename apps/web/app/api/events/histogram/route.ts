import { sql } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload, type Payload } from "payload";

import { logger, logError } from "@/lib/logger";
import config from "@/payload.config";

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function isValidBounds(value: unknown): value is MapBounds {
  return (
    typeof value === "object" &&
    value != null &&
    typeof (value as Record<string, unknown>).north === "number" &&
    typeof (value as Record<string, unknown>).south === "number" &&
    typeof (value as Record<string, unknown>).east === "number" &&
    typeof (value as Record<string, unknown>).west === "number"
  );
}

function parseBounds(boundsParam: string): MapBounds {
  const parsedBounds = JSON.parse(boundsParam) as unknown;
  if (!isValidBounds(parsedBounds)) {
    throw new Error("Invalid bounds format");
  }
  return parsedBounds;
}

async function checkHistogramFunction(payload: Payload): Promise<boolean> {
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
}

function buildFiltersWithBounds(params: {
  catalog: string | null;
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
  bounds: MapBounds | null;
}) {
  return {
    catalogId: params.catalog != null && params.catalog !== "" ? parseInt(params.catalog) : undefined,
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
}

export async function GET(request: NextRequest) {
  try {
    const parameters = extractHistogramParameters(request.nextUrl.searchParams);
    const payload = await getPayload({ config });
    const boundsResult = parseBoundsParameter(parameters.boundsParam);
    if ("error" in boundsResult) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    const functionExists = await checkHistogramFunction(payload);
    if (!functionExists) {
      return createFunctionNotFoundResponse();
    }

    const histogramResult = await executeHistogramQuery(payload, parameters, bounds);
    const response = buildHistogramResponse(histogramResult.rows);

    return NextResponse.json(response);
  } catch (_error) {
    logError(_error, "Failed to calculate histogram", { parameters: _error });
    return NextResponse.json({ error: "Failed to calculate histogram" }, { status: 500 });
  }
}

function extractHistogramParameters(searchParams: URLSearchParams) {
  return {
    boundsParam: searchParams.get("bounds"),
    catalog: searchParams.get("catalog"),
    datasets: searchParams.getAll("datasets"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    granularity: searchParams.get("granularity") ?? "auto",
  };
}

function parseBoundsParameter(boundsParam: string | null): { bounds: MapBounds | null } | { error: NextResponse } {
  if (boundsParam == null || boundsParam === "") {
    return { bounds: null };
  }

  try {
    return { bounds: parseBounds(boundsParam) };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid bounds format. Expected: {north, south, east, west}" },
        { status: 400 },
      ),
    };
  }
}

function createFunctionNotFoundResponse(): NextResponse {
  logger.error("Required calculate_event_histogram function not found in database");
  return NextResponse.json(
    {
      error: "Database function calculate_event_histogram not found. Please ensure migrations are run.",
      code: "MISSING_DB_FUNCTION",
    },
    { status: 500 },
  );
}

async function executeHistogramQuery(
  payload: Awaited<ReturnType<typeof getPayload>>,
  parameters: ReturnType<typeof extractHistogramParameters>,
  bounds: MapBounds | null,
) {
  const filtersWithBounds = buildFiltersWithBounds({
    catalog: parameters.catalog,
    datasets: parameters.datasets,
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    bounds,
  });

  const interval = parameters.granularity === "auto" ? "day" : parameters.granularity;

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${interval}::text,
      ${JSON.stringify(filtersWithBounds)}::jsonb
    )
  `)) as { rows: Array<{ bucket: string; event_count: number }> };
}

function buildHistogramResponse(rows: Array<{ bucket: string; event_count: number }>) {
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
}
