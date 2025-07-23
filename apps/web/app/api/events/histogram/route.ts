import { sql } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import config from "../../../../payload.config";

import { logger, logError } from "@/lib/logger";

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function isValidBounds(value: unknown): value is MapBounds {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).north === "number" &&
    typeof (value as Record<string, unknown>).south === "number" &&
    typeof (value as Record<string, unknown>).east === "number" &&
    typeof (value as Record<string, unknown>).west === "number"
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Extract parameters
  const boundsParam = searchParams.get("bounds");
  const catalog = searchParams.get("catalog");
  const datasets = searchParams.getAll("datasets");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const granularity = searchParams.get("granularity") ?? "auto";

  try {
    const payload = await getPayload({ config });

    // Parse bounds if provided
    let bounds: MapBounds | null = null;
    if (boundsParam !== null && boundsParam !== "") {
      try {
        const parsedBounds = JSON.parse(boundsParam) as unknown;
        if (!isValidBounds(parsedBounds)) {
          throw new Error("Invalid bounds format");
        }
        bounds = parsedBounds;
      } catch {
        return NextResponse.json(
          {
            error:
              "Invalid bounds format. Expected: {north, south, east, west}",
          },
          { status: 400 },
        );
      }
    }

    // Build filters object
    const filters: Record<string, unknown> = {};
    if (catalog !== null && catalog !== "") filters.catalog = catalog;
    if (datasets.length > 0 && datasets[0] !== "") filters.datasets = datasets;
    if (startDate !== null && startDate !== "") filters.startDate = startDate;
    if (endDate !== null && endDate !== "") filters.endDate = endDate;

    // Check if histogram function exists
    let functionExists = false;

    try {
      const functionCheck = (await payload.db.drizzle.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc 
          WHERE proname = 'calculate_event_histogram'
        ) as exists
      `)) as { rows: Array<{ exists: boolean }> };
      functionExists = functionCheck.rows[0]?.exists ?? false;
    } catch (error) {
      logger.warn("Function check failed:", {
        error: (error as Error).message,
      });
      functionExists = false;
    }

    let result:
      | { rows: Array<{ bucket: string; event_count: number }> }
      | undefined;
    let aggregations: {
      total?: number;
      dateRange?: { min: string | null; max: string | null };
      counts?: { datasets: number; catalogs: number };
    } = {};

    if (!functionExists) {
      logger.error(
        "Required calculate_event_histogram function not found in database",
      );
      return NextResponse.json(
        {
          error:
            "Database function calculate_event_histogram not found. Please ensure migrations are run.",
          code: "MISSING_DB_FUNCTION",
        },
        { status: 500 },
      );
    }

    if (functionExists) {
      // Use the histogram function
      const filtersWithBounds = {
        catalogId:
          catalog !== null && catalog !== "" ? parseInt(catalog) : undefined,
        datasets:
          datasets.length > 0 ? datasets.map((d) => parseInt(d)) : undefined,
        startDate,
        endDate,
        ...(bounds != null && {
          bounds: {
            minLng: bounds.west,
            maxLng: bounds.east,
            minLat: bounds.south,
            maxLat: bounds.north,
          },
        }),
      };

      // Determine interval
      let interval = granularity;
      if (granularity === "auto") {
        interval = "day"; // Default for now
      }

      result = (await payload.db.drizzle.execute(sql`
        SELECT * FROM calculate_event_histogram(
          ${interval}::text,
          ${JSON.stringify(filtersWithBounds)}::jsonb
        )
      `)) as { rows: Array<{ bucket: string; event_count: number }> };

      // Calculate total from result
      const total = result.rows.reduce(
        (sum: number, row) => sum + parseInt(String(row.event_count), 10),
        0,
      );

      aggregations = {
        total,
        dateRange: {
          min: result.rows[0]?.bucket ?? null,
          max: result.rows[result.rows.length - 1]?.bucket ?? null,
        },
      };
    }

    // Transform the histogram data
    const histogram =
      result?.rows.map((row) => ({
        date: row.bucket,
        count: parseInt(String(row.event_count), 10),
      })) ?? [];

    return NextResponse.json({
      histogram,
      metadata: {
        total: aggregations.total ?? 0,
        dateRange: aggregations.dateRange ?? { min: null, max: null },
        counts: aggregations.counts ?? { datasets: 0, catalogs: 0 },
        // TODO: Add dataset/catalog breakdowns if needed
        topDatasets: [],
        topCatalogs: [],
      },
    });
  } catch (_error) {
    logError(_error, "Failed to calculate histogram", { datasets });
    return NextResponse.json(
      { error: "Failed to calculate histogram" },
      { status: 500 },
    );
  }
}
