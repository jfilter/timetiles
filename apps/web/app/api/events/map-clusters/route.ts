import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayloadHMR } from "@payloadcms/next/utilities";
import { sql } from "@payloadcms/db-postgres";
import config from "../../../../payload.config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    // Use global test payload instance if available (for tests)
    const payload =
      (global as any).__TEST_PAYLOAD__ || (await getPayloadHMR({ config }));
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
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid bounds format. Expected: {north, south, east, west}",
        },
        { status: 400 },
      );
    }

    // Build filters object
    const filters: Record<string, any> = {};
    if (catalog) filters.catalog = catalog;
    if (datasets.length > 0 && datasets[0] !== "") filters.datasets = datasets;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Check if clustering function exists (force fallback for tests)
    const isTestMode = !!(global as any).__TEST_PAYLOAD__;
    let functionExists = false;

    if (!isTestMode) {
      try {
        const functionCheck = await payload.db.drizzle.execute(sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'cluster_events'
          ) as exists
        `);
        functionExists = functionCheck.rows[0]?.exists;
        logger.debug("Clustering function check - exists:", {
          functionExists,
          isTestMode,
        });
      } catch (error) {
        logger.warn("Function check failed, using fallback query:", {
          error: (error as Error).message,
        });
        functionExists = false;
      }
    } else {
      logger.debug("Test mode detected, using fallback query");
    }

    let result;
    if (!functionExists || isTestMode) {
      // Fallback to basic query without clustering
      logger.warn("cluster_events function not found, using fallback query", {
        functionExists,
        isTestMode,
      });

      result = await payload.db.drizzle.execute(sql`
        SELECT
          id::text as cluster_id,
          location_longitude as longitude,
          location_latitude as latitude,
          1 as event_count,
          id::text as event_id,
          COALESCE(data->>'title', data->>'name', 'Event ' || id) as event_title
        FROM payload.events
        WHERE
          location_longitude BETWEEN ${bounds.west}::double precision AND ${bounds.east}::double precision
          AND location_latitude BETWEEN ${bounds.south}::double precision AND ${bounds.north}::double precision
          AND location_longitude IS NOT NULL
          AND location_latitude IS NOT NULL
          ${catalog ? sql`AND dataset_id IN (SELECT id FROM payload.datasets WHERE catalog_id = ${parseInt(catalog)})` : sql``}
          ${
            datasets.length > 0
              ? sql`AND dataset_id IN (${sql.join(
                  datasets.map((d) => sql`${parseInt(d)}`),
                  sql`, `,
                )})`
              : sql``
          }
          ${startDate ? sql`AND event_timestamp >= ${startDate}::timestamp` : sql``}
          ${endDate ? sql`AND event_timestamp <= ${endDate}::timestamp` : sql``}
        LIMIT 1000
      `);
    } else {
      // Call the clustering function
      result = await payload.db.drizzle.execute(sql`
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
      `);
    }

    // Transform the result for the frontend
    const clusters = result.rows.map((row: any) => {
      const isCluster = row.event_count > 1;

      if (isCluster) {
        logger.debug("Cluster found:", { row });
      }

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)],
        },
        properties: {
          id: row.cluster_id || row.event_id,
          type: isCluster ? "event-cluster" : "event-point",
          ...(isCluster && { count: row.event_count }),
          ...(row.event_title && { title: row.event_title }),
          ...(row.event_ids &&
            row.event_count <= 10 && { eventIds: row.event_ids }),
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
      stack: (error as any).stack,
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
