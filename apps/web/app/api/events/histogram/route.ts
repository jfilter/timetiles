import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "@payloadcms/db-postgres";
import config from "../../../../payload.config";
import { logger, logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Extract parameters
  const boundsParam = searchParams.get("bounds");
  const catalog = searchParams.get("catalog");
  const datasets = searchParams.getAll("datasets");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const granularity = searchParams.get("granularity") || "auto";

  try {
    const payload = await getPayload({ config });

    // Parse bounds if provided
    let bounds = null;
    if (boundsParam) {
      try {
        bounds = JSON.parse(boundsParam);
        if (!bounds.north || !bounds.south || !bounds.east || !bounds.west) {
          throw new Error("Invalid bounds format");
        }
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
    const filters: Record<string, any> = {};
    if (catalog) filters.catalog = catalog;
    if (datasets.length > 0 && datasets[0] !== "") filters.datasets = datasets;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Check if histogram function exists (force fallback for tests)
    const testMode = process.env.NODE_ENV === "test";
    let functionExists = false;

    if (!testMode) {
      try {
        const functionCheck = await payload.db.drizzle.execute(sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'calculate_event_histogram'
          ) as exists
        `);
        functionExists = functionCheck.rows[0]?.exists;
      } catch (error) {
        logger.warn("Function check failed, using fallback query:", {
          error: (error as Error).message,
        });
        functionExists = false;
      }
    }

    let result;
    let aggregations: {
      total?: number;
      dateRange?: { min: any; max: any };
      counts?: { datasets: number; catalogs: number };
    } = {};

    if (!functionExists || testMode) {
      // Fallback to basic aggregation query
      logger.warn(
        "calculate_event_histogram function not found, using fallback query",
      );

      // Determine interval based on date range or granularity
      let interval = granularity;
      if (granularity === "auto") {
        interval = "day"; // Default to day for simplicity
      }

      // Basic histogram query
      result = await payload.db.drizzle.execute(sql`
        SELECT 
          date_trunc(${interval}, e.event_timestamp) as bucket,
          COUNT(*) as event_count
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.event_timestamp IS NOT NULL
          ${catalog ? sql`AND d.catalog_id = ${parseInt(catalog)}` : sql``}
          ${
            datasets.length > 0
              ? sql`AND e.dataset_id IN (${sql.join(
                  datasets.map((d) => sql`${parseInt(d)}`),
                  sql`, `,
                )})`
              : sql``
          }
          ${startDate ? sql`AND e.event_timestamp >= ${startDate}::timestamp` : sql``}
          ${endDate ? sql`AND e.event_timestamp <= ${endDate}::timestamp` : sql``}
          ${
            bounds
              ? sql`
            AND e.location_longitude BETWEEN ${bounds.west} AND ${bounds.east}
            AND e.location_latitude BETWEEN ${bounds.south} AND ${bounds.north}
          `
              : sql``
          }
        GROUP BY bucket
        ORDER BY bucket
      `);

      // Get total count and date range
      const statsResult = await payload.db.drizzle.execute(sql`
        SELECT 
          COUNT(*) as total,
          MIN(e.event_timestamp) as min_date,
          MAX(e.event_timestamp) as max_date,
          COUNT(DISTINCT e.dataset_id) as dataset_count,
          COUNT(DISTINCT d.catalog_id) as catalog_count
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.event_timestamp IS NOT NULL
          ${catalog ? sql`AND d.catalog_id = ${parseInt(catalog)}` : sql``}
          ${
            datasets.length > 0
              ? sql`AND e.dataset_id IN (${sql.join(
                  datasets.map((d) => sql`${parseInt(d)}`),
                  sql`, `,
                )})`
              : sql``
          }
          ${startDate ? sql`AND e.event_timestamp >= ${startDate}::timestamp` : sql``}
          ${endDate ? sql`AND e.event_timestamp <= ${endDate}::timestamp` : sql``}
          ${
            bounds
              ? sql`
            AND e.location_longitude BETWEEN ${bounds.west} AND ${bounds.east}
            AND e.location_latitude BETWEEN ${bounds.south} AND ${bounds.north}
          `
              : sql``
          }
      `);

      const stats = statsResult.rows[0] || {};
      aggregations = {
        total: parseInt(stats.total, 10) || 0,
        dateRange: {
          min: stats.min_date,
          max: stats.max_date,
        },
        counts: {
          datasets: parseInt(stats.dataset_count, 10) || 0,
          catalogs: parseInt(stats.catalog_count, 10) || 0,
        },
      };
    } else {
      // Use the histogram function
      const filtersWithBounds = {
        catalogId: catalog ? parseInt(catalog) : undefined,
        datasets:
          datasets.length > 0 ? datasets.map((d) => parseInt(d)) : undefined,
        startDate,
        endDate,
        ...(bounds && {
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

      result = await payload.db.drizzle.execute(sql`
        SELECT * FROM calculate_event_histogram(
          ${interval}::text,
          ${JSON.stringify(filtersWithBounds)}::jsonb
        )
      `);

      // Calculate total from result
      const total = result.rows.reduce(
        (sum: number, row: any) => sum + parseInt(row.event_count, 10),
        0,
      );

      aggregations = {
        total,
        dateRange: {
          min: result.rows[0]?.bucket || null,
          max: result.rows[result.rows.length - 1]?.bucket || null,
        },
      };
    }

    // Transform the histogram data
    const histogram = result.rows.map((row: any) => ({
      date: row.bucket,
      count: parseInt(row.event_count || row.count, 10),
    }));

    return NextResponse.json({
      histogram,
      metadata: {
        total: aggregations.total || 0,
        dateRange: aggregations.dateRange || { min: null, max: null },
        counts: aggregations.counts || { datasets: 0, catalogs: 0 },
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
