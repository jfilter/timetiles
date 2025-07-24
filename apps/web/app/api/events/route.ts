import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Where } from "payload";

import type { Event } from "../../../payload-types";
import config from "../../../payload.config";

import { logger } from "@/lib/logger";

function getEventDataValue(
  data: Record<string, unknown>,
  field: string,
): unknown {
  // Safe property access to avoid object injection - additional validation
  if (
    typeof field === "string" &&
    field.length > 0 &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, field) &&
    Object.prototype.hasOwnProperty.call(data, field)
  ) {
    return data[field];
  }
  return undefined;
}

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

function addCatalogFilter(where: Where, catalog: string) {
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "dataset.catalog.slug": {
        equals: catalog,
      },
    },
  ];
}

function addDatasetFilter(where: Where, datasets: string[]) {
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "dataset.slug": {
        in: datasets,
      },
    },
  ];
}

function addBoundsFilter(where: Where, bounds: MapBounds) {
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

function addDateFilter(
  where: Where,
  startDate: string | null,
  endDate: string | null,
) {
  const dateFilter: Record<string, string> = {};
  if (startDate !== null) dateFilter.greater_than_equal = startDate;
  if (endDate !== null) dateFilter.less_than_equal = endDate;

  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      eventTimestamp: dateFilter,
    },
  ];
}

function filterEventsByDate(
  events: Event[],
  startDate: string | null,
  endDate: string | null,
): Event[] {
  if (startDate === null && endDate === null) {
    return events;
  }

  const startDateTime = startDate !== null ? new Date(startDate) : null;
  const endDateTime = endDate !== null ? new Date(endDate) : null;
  if (endDateTime !== null) {
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
}

function matchesEventTimestamp(
  event: Event,
  startDateTime: Date | null,
  endDateTime: Date | null,
): boolean {
  if (event.eventTimestamp === null || event.eventTimestamp === undefined) {
    return false;
  }

  const eventDate = new Date(event.eventTimestamp);
  return (
    (!startDateTime || eventDate >= startDateTime) &&
    (!endDateTime || eventDate < endDateTime)
  );
}

function matchesDataFieldDates(
  event: Event,
  startDateTime: Date | null,
  endDateTime: Date | null,
): boolean {
  const commonDateFields = [
    "date",
    "startDate",
    "start_date",
    "eventDate",
    "event_date",
  ];

  for (const dateField of commonDateFields) {
    if (matchesDataFieldDate(event, dateField, startDateTime, endDateTime)) {
      return true;
    }
  }
  return false;
}

function matchesDataFieldDate(
  event: Event,
  dateField: string,
  startDateTime: Date | null,
  endDateTime: Date | null,
): boolean {
  const eventData = event.data;
  if (
    eventData === null ||
    typeof eventData !== "object" ||
    Array.isArray(eventData)
  ) {
    return false;
  }

  const dataDateValue = getEventDataValue(
    eventData as Record<string, unknown>,
    dateField,
  );
  if (dataDateValue == null || typeof dataDateValue !== "string") {
    return false;
  }

  const dataDate = new Date(dataDateValue);
  if (isNaN(dataDate.getTime())) {
    return false;
  }

  return (
    (!startDateTime || dataDate >= startDateTime) &&
    (!endDateTime || dataDate < endDateTime)
  );
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const searchParams = request.nextUrl.searchParams;

    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const boundsParam = searchParams.get("bounds");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Where = {};

    // Apply catalog and dataset filters
    if (catalog !== null || (datasets.length > 0 && datasets[0] !== "")) {
      if (catalog !== null && (datasets.length === 0 || datasets[0] === "")) {
        addCatalogFilter(where, catalog);
      }

      if (datasets.length > 0 && datasets[0] !== "") {
        addDatasetFilter(where, datasets);
      }
    }

    // Apply bounds filter
    if (boundsParam !== null) {
      try {
        const parsedBounds = JSON.parse(boundsParam) as unknown;
        if (isValidBounds(parsedBounds)) {
          addBoundsFilter(where, parsedBounds);
        }
      } catch (error) {
        logger.error("Invalid bounds parameter:", error);
      }
    }

    // Apply date filter
    if (startDate !== null || endDate !== null) {
      addDateFilter(where, startDate, endDate);
    }

    const events = await payload.find({
      collection: "events",
      where,
      limit: 1000,
      depth: 2,
    });

    // Additional filtering by data fields (post-processing)
    const filteredEvents = filterEventsByDate(events.docs, startDate, endDate);

    // Serialize the response to avoid JSON serialization issues
    const serializedEvents = {
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
        dataset:
          typeof event.dataset === "object" && event.dataset !== null
            ? event.dataset.id
            : event.dataset,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
      totalDocs: filteredEvents.length,
      limit: events.limit,
      page: events.page ?? 1,
      totalPages: Math.ceil(filteredEvents.length / (events.limit || 1000)),
      hasNextPage:
        filteredEvents.length > (events.limit || 1000) * (events.page ?? 1),
      hasPrevPage: (events.page ?? 1) > 1,
    };

    return NextResponse.json(serializedEvents);
  } catch (error) {
    logger.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
