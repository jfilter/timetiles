/**
 * This file defines the main API route for fetching event data.
 *
 * It provides a flexible endpoint that allows clients to retrieve events based on a variety
 * of filters, including catalog, datasets, geographic bounds, and date ranges. The handler
 * constructs a dynamic `Where` clause for the Payload query based on the provided
 * search parameters. The results are then serialized into a clean, consistent format
 * for the client.
 * @module
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Where } from "payload";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import config from "@/payload.config";
import type { Event } from "@/payload-types";

const getEventDataValue = (data: Record<string, unknown>, field: string): unknown => {
  // Safe property access to avoid object injection - additional validation
  if (
    typeof field === "string" &&
    field.length > 0 &&
    !Object.hasOwn(Object.prototype, field) &&
    Object.hasOwn(data, field)
  ) {
    return data[field];
  }
  return undefined;
};

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

const filterEventsByDate = (events: Event[], startDate: string | null, endDate: string | null): Event[] => {
  if (startDate == null && endDate == null) {
    return events;
  }

  const startDateTime = startDate != null ? new Date(startDate) : null;
  const endDateTime = endDate != null ? new Date(endDate) : null;
  if (endDateTime != null) {
    endDateTime.setDate(endDateTime.getDate() + 1);
  }

  return events.filter((event: Event) => {
    // Check eventTimestamp first
    if (matchesEventTimestamp(event, startDateTime, endDateTime)) {
      return true;
    }

    // Check data fields for date
    return matchesDataFieldDates(event, startDateTime, endDateTime);
  });
};

const matchesEventTimestamp = (event: Event, startDateTime: Date | null, endDateTime: Date | null): boolean => {
  if (event.eventTimestamp == null || event.eventTimestamp == undefined) {
    return false;
  }

  const eventDate = new Date(event.eventTimestamp);
  return (!startDateTime || eventDate >= startDateTime) && (!endDateTime || eventDate < endDateTime);
};

const matchesDataFieldDates = (event: Event, startDateTime: Date | null, endDateTime: Date | null): boolean => {
  const commonDateFields = ["date", "startDate", "start_date", "eventDate", "event_date"];

  for (const dateField of commonDateFields) {
    if (matchesDataFieldDate(event, dateField, startDateTime, endDateTime)) {
      return true;
    }
  }
  return false;
};

const matchesDataFieldDate = (
  event: Event,
  dateField: string,
  startDateTime: Date | null,
  endDateTime: Date | null
): boolean => {
  const eventData = event.data;
  if (eventData == null || typeof eventData !== "object" || Array.isArray(eventData)) {
    return false;
  }

  const dataDateValue = getEventDataValue(eventData as Record<string, unknown>, dateField);
  if (dataDateValue == null || typeof dataDateValue !== "string") {
    return false;
  }

  const dataDate = new Date(dataDateValue);
  if (isNaN(dataDate.getTime())) {
    return false;
  }

  return (!startDateTime || dataDate >= startDateTime) && (!endDateTime || dataDate < endDateTime);
};

export const GET = async (request: NextRequest) => {
  try {
    const payload = await getPayload({ config });
    const parameters = extractEventsParameters(request.nextUrl.searchParams);
    const where = buildEventsWhereClause(parameters);
    const events = await executeEventsQuery(payload, where);
    const filteredEvents = filterEventsByDate(events.docs, parameters.startDate, parameters.endDate);
    const response = serializeEventsResponse(filteredEvents, events);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching events:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
};

const extractEventsParameters = (searchParams: URLSearchParams) => ({
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  boundsParam: searchParams.get("bounds"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
});

const buildEventsWhereClause = (parameters: ReturnType<typeof extractEventsParameters>): Where => {
  const where: Where = {};
  const { catalog, datasets, boundsParam, startDate, endDate } = parameters;

  applyCatalogAndDatasetFilters(where, catalog, datasets);
  applyBoundsFilter(where, boundsParam);
  applyDateFilters(where, startDate, endDate);

  return where;
};

const applyCatalogAndDatasetFilters = (where: Where, catalog: string | null, datasets: string[]) => {
  if (catalog != null || (datasets.length > 0 && datasets[0] !== "")) {
    if (catalog != null && (datasets.length === 0 || datasets[0] === "")) {
      addCatalogFilter(where, catalog);
    }
    if (datasets.length > 0 && datasets[0] !== "") {
      addDatasetFilter(where, datasets);
    }
  }
};

const applyBoundsFilter = (where: Where, boundsParam: string | null) => {
  if (boundsParam != null) {
    try {
      const parsedBounds = JSON.parse(boundsParam) as unknown;
      if (isValidBounds(parsedBounds)) {
        addBoundsFilter(where, parsedBounds);
      }
    } catch (error) {
      logger.error("Invalid bounds parameter:", error);
    }
  }
};

const applyDateFilters = (where: Where, startDate: string | null, endDate: string | null) => {
  if (startDate != null || endDate != null) {
    addDateFilter(where, startDate, endDate);
  }
};

const executeEventsQuery = async (payload: Awaited<ReturnType<typeof getPayload>>, where: Where) =>
  payload.find({
    collection: "events",
    where,
    limit: 1000,
    depth: 2,
  });

const serializeEventsResponse = (filteredEvents: Event[], events: Awaited<ReturnType<typeof executeEventsQuery>>) => ({
  docs: filteredEvents.map((event: Event) => ({
    id: event.id,
    data: event.data,
    location: event.location
      ? {
          longitude: event.location.longitude,
          latitude: event.location.latitude,
        }
      : { longitude: null, latitude: null },
    eventTimestamp: event.eventTimestamp,
    dataset: typeof event.dataset === "object" && event.dataset != null ? event.dataset.id : event.dataset,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  })),
  totalDocs: filteredEvents.length,
  limit: events.limit,
  page: events.page ?? 1,
  totalPages: Math.ceil(filteredEvents.length / (events.limit || 1000)),
  hasNextPage: filteredEvents.length > (events.limit || 1000) * (events.page ?? 1),
  hasPrevPage: (events.page ?? 1) > 1,
});
