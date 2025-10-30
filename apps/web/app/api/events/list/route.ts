/**
 * This file defines the API route for fetching a list of events.
 *
 * It provides a flexible endpoint that allows clients to retrieve events based on a variety
 * of filters, including catalog, datasets, geographic bounds, and date ranges. The handler
 * constructs a dynamic `Where` clause for the Payload query based on the provided
 * search parameters. The results are then serialized into a clean, consistent format
 * for the client.
 * @module
 */
import { NextResponse } from "next/server";
import type { Where } from "payload";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import config from "@/payload.config";
import type { Event } from "@/payload-types";

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

const addCatalogFilter = (where: Where, catalog: string) => {
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "dataset.catalog.slug": {
        equals: catalog,
      },
    },
  ];
};

const addDatasetFilter = (where: Where, datasets: string[]) => {
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "dataset.slug": {
        in: datasets,
      },
    },
  ];
};

const addBoundsFilter = (where: Where, bounds: MapBounds) => {
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
};

const addDateFilter = (where: Where, startDate: string | null, endDate: string | null) => {
  const dateFilter: Record<string, string> = {};
  if (startDate != null) dateFilter.greater_than_equal = startDate;
  if (endDate != null) dateFilter.less_than_equal = endDate;

  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      eventTimestamp: dateFilter,
    },
  ];
};

const transformEvent = (event: Event) => ({
  id: event.id,
  dataset: {
    id: typeof event.dataset === "object" && event.dataset != null ? event.dataset.id : event.dataset,
    title: typeof event.dataset === "object" && event.dataset != null ? event.dataset.name : undefined,
    catalog:
      typeof event.dataset === "object" &&
      event.dataset != null &&
      typeof event.dataset.catalog === "object" &&
      event.dataset.catalog != null
        ? event.dataset.catalog.name
        : undefined,
  },
  data: event.data,
  location: event.location
    ? {
        longitude: event.location.longitude,
        latitude: event.location.latitude,
      }
    : null,
  eventTimestamp: event.eventTimestamp,
  isValid: event.validationStatus === "valid",
});

export const GET = withRateLimit(
  withOptionalAuth(async (request: AuthenticatedRequest) => {
    try {
      const payload = await getPayload({ config });

      const parameters = extractListParameters(request.nextUrl.searchParams);
    const where = buildWhereClause(parameters);
    const result = await executeEventsQuery(payload, where, parameters, request.user);
    const response = buildListResponse(result);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching events list:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
  }),
  { type: "API_GENERAL" }
);

const extractListParameters = (searchParams: URLSearchParams) => ({
  boundsParam: searchParams.get("bounds"),
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
  page: parseInt(searchParams.get("page") ?? "1", 10),
  limit: Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 1000),
  sort: searchParams.get("sort") ?? "-eventTimestamp",
});

const buildWhereClause = (parameters: ReturnType<typeof extractListParameters>): Where => {
  const where: Where = {};

  addFiltersToWhere(where, parameters);
  addBoundsToWhere(where, parameters.boundsParam);
  addDateFiltersToWhere(where, parameters.startDate, parameters.endDate);

  return where;
};

const addFiltersToWhere = (where: Where, parameters: ReturnType<typeof extractListParameters>) => {
  const { catalog, datasets } = parameters;
  if (catalog != null || (datasets.length > 0 && datasets[0] !== "")) {
    if (catalog != null && (datasets.length === 0 || datasets[0] === "")) {
      addCatalogFilter(where, catalog);
    }
    if (datasets.length > 0 && datasets[0] !== "") {
      addDatasetFilter(where, datasets);
    }
  }
};

const addBoundsToWhere = (where: Where, boundsParam: string | null) => {
  if (boundsParam != null) {
    try {
      const parsedBounds = JSON.parse(boundsParam) as unknown;
      if (isValidBounds(parsedBounds)) {
        addBoundsFilter(where, parsedBounds);
      }
    } catch {
      throw new Error("Invalid bounds format");
    }
  }
};

const addDateFiltersToWhere = (where: Where, startDate: string | null, endDate: string | null) => {
  if (startDate != null || endDate != null) {
    addDateFilter(where, startDate, endDate);
  }
};

const executeEventsQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  where: Where,
  parameters: ReturnType<typeof extractListParameters>,
  user?: { id: string; email: string; role: string }
) =>
  payload.find({
    collection: "events",
    where,
    page: parameters.page,
    limit: parameters.limit,
    sort: parameters.sort,
    depth: 2,
    user,
    overrideAccess: false,
  });

const buildListResponse = (result: Awaited<ReturnType<typeof executeEventsQuery>>) => ({
  events: result.docs.map(transformEvent),
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
