import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Where } from "payload";
import config from "../../../../payload.config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const searchParams = request.nextUrl.searchParams;

    // Extract parameters
    const boundsParam = searchParams.get("bounds");
    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "100", 10),
      1000,
    );
    const sort = searchParams.get("sort") || "-eventTimestamp";

    // Build where clause
    const where: Where = {};

    // Catalog and dataset filters
    if (catalog || (datasets.length > 0 && datasets[0] !== "")) {
      if (catalog && (datasets.length === 0 || datasets[0] === "")) {
        where.and = [
          ...(Array.isArray(where.and) ? where.and : []),
          {
            "dataset.catalog.slug": {
              equals: catalog,
            },
          },
        ];
      }

      if (datasets.length > 0 && datasets[0] !== "") {
        where.and = [
          ...(Array.isArray(where.and) ? where.and : []),
          {
            "dataset.slug": {
              in: datasets,
            },
          },
        ];
      }
    }

    // Bounds filter
    if (boundsParam) {
      try {
        const bounds = JSON.parse(boundsParam);
        if (bounds.north && bounds.south && bounds.east && bounds.west) {
          where.and = [
            ...(Array.isArray(where.and) ? where.and : []),
            {
              "location.latitude": {
                greater_than_equal: bounds.south,
              },
            },
            {
              "location.latitude": {
                less_than_equal: bounds.north,
              },
            },
            {
              "location.longitude": {
                greater_than_equal: bounds.west,
              },
            },
            {
              "location.longitude": {
                less_than_equal: bounds.east,
              },
            },
          ];
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid bounds format" },
          { status: 400 },
        );
      }
    }

    // Date filters
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.greater_than_equal = startDate;
      if (endDate) dateFilter.less_than_equal = endDate;

      where.and = [
        ...(Array.isArray(where.and) ? where.and : []),
        {
          eventTimestamp: dateFilter,
        },
      ];
    }

    // Query events with pagination
    const result = await payload.find({
      collection: "events",
      where,
      page,
      limit,
      sort,
      depth: 2, // Include related data
    });

    // Transform events for frontend
    const events = result.docs.map((event: any) => ({
      id: event.id,
      dataset: {
        id: event.dataset?.id,
        title: event.dataset?.title,
        catalog: event.dataset?.catalog?.title,
      },
      data: event.data,
      location:
        event.location?.longitude && event.location?.latitude
          ? {
              longitude: event.location.longitude,
              latitude: event.location.latitude,
            }
          : null,
      eventTimestamp: event.eventTimestamp,
      isValid: event.isValid,
    }));

    return NextResponse.json({
      events,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
        nextPage: result.nextPage,
        prevPage: result.prevPage,
      },
    });
  } catch (error) {
    logger.error("Error fetching events list:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
