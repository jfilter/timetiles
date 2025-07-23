import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "@payloadcms/db-postgres";
import config from "../../../../payload.config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const searchParams = request.nextUrl.searchParams;

    // Extract parameters
    const boundsParam = searchParams.get("bounds");
    const zoom = parseInt(searchParams.get("zoom") || "10", 10);
    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Validate required parameters
    if (!boundsParam) {
      return NextResponse.json(
        { error: "Missing bounds parameter" },
        { status: 400 },
      );
    }

    // Parse bounds
    let bounds;
    try {
      bounds = JSON.parse(boundsParam);
      if (!bounds.north || !bounds.south || !bounds.east || !bounds.west) {
        throw new Error("Invalid bounds format");
      }
    } catch {
      return NextResponse.json(
        {
          error: "Invalid bounds format. Expected: {north, south, east, west}",
        },
        { status: 400 },
      );
    }

    // Build filters object
    const filters: Record<string, unknown> = {};
    if (catalog) filters.catalog = catalog;
    if (datasets.length > 0 && datasets[0] !== "") filters.datasets = datasets;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Check if clustering function exists
    let functionExists = false;

    try {
      const functionCheck = (await payload.db.drizzle.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = 'cluster_events'
        ) as exists
      `)) as { rows: Array<{ exists: boolean }> };
      functionExists = functionCheck.rows[0]?.exists ?? false;
      logger.debug("Clustering function check - exists:", {
        functionExists,
      });
    } catch (error) {
      logger.warn("Function check failed:", {
        error: (error as Error).message,
      });
      functionExists = false;
    }

    if (!functionExists) {
      logger.error("Required cluster_events function not found in database");
      return NextResponse.json(
        {
          error:
            "Database function cluster_events not found. Please ensure migrations are run.",
          code: "MISSING_DB_FUNCTION",
        },
        { status: 500 },
      );
    }

    // Call the clustering function
    const result = (await payload.db.drizzle.execute(sql`
      SELECT * FROM cluster_events(
        ${bounds.west}::double precision,
        ${bounds.south}::double precision,
        ${bounds.east}::double precision,
        ${bounds.north}::double precision,
        ${zoom}::integer,
        ${JSON.stringify({
          catalogId: catalog ? parseInt(catalog) : undefined,
          datasetId:
            datasets.length === 1 && datasets[0]
              ? parseInt(datasets[0])
              : undefined,
          startDate,
          endDate,
        })}::jsonb
      )
    `)) as { rows: Array<Record<string, unknown>> };

    // Transform the result for the frontend
    const clusters = result.rows.map((row: Record<string, unknown>) => {
      const isCluster = Number(row.event_count) > 1;

      if (isCluster) {
        logger.debug("Cluster found:", { row });
      }

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            parseFloat(String(row.longitude)),
            parseFloat(String(row.latitude)),
          ],
        },
        properties: {
          id: row.cluster_id || row.event_id,
          type: isCluster ? "event-cluster" : "event-point",
          ...(isCluster ? { count: Number(row.event_count) } : {}),
          ...(row.event_title ? { title: String(row.event_title) } : {}),
          ...(row.event_ids && Number(row.event_count) <= 10
            ? { eventIds: row.event_ids }
            : {}),
        },
      };
    });

    return NextResponse.json({
      type: "FeatureCollection",
      features: clusters,
    });
  } catch (error) {
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
  }
}
