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

import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { type MapBounds, parseBoundsParameter } from "@/lib/types/geo";
import config from "@/payload.config";
import type { Event, User } from "@/payload-types";

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
    fieldMetadata:
      typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMetadata : undefined,
    displayConfig:
      typeof event.dataset === "object" && event.dataset != null ? event.dataset.displayConfig : undefined,
  },
  data: event.data,
  location: event.location
    ? {
        longitude: event.location.longitude,
        latitude: event.location.latitude,
      }
    : null,
  geocodingInfo: event.geocodingInfo,
  eventTimestamp: event.eventTimestamp,
  isValid: event.validationStatus === "valid",
});

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractListParameters(request.nextUrl.searchParams);

    // Validate bounds parameter
    const boundsResult = parseBoundsParameter(parameters.boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }

    const where = buildWhereClause(parameters, boundsResult.bounds);
    const result = await executeEventsQuery(payload, where, parameters, request.user);
    const response = buildListResponse(result);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, "Failed to fetch events list", { user: request.user?.id });
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
});

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

const buildWhereClause = (parameters: ReturnType<typeof extractListParameters>, bounds: MapBounds | null): Where => {
  const where: Where = {};

  addFiltersToWhere(where, parameters);
  addBoundsToWhere(where, bounds);
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

const addBoundsToWhere = (where: Where, bounds: MapBounds | null) => {
  if (bounds != null) {
    addBoundsFilter(where, bounds);
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
  user?: User | null
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
