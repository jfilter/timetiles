import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Where } from "payload";

import type { Event } from "../../../payload-types";
import config from "../../../payload.config";

import { logger } from "@/lib/logger";

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
  try {
    const payload = await getPayload({ config });
    const searchParams = request.nextUrl.searchParams;

    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const boundsParam = searchParams.get("bounds");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Where = {};

    if (catalog !== null || (datasets.length > 0 && datasets[0] !== "")) {
      if (catalog !== null && (datasets.length === 0 || datasets[0] === "")) {
        // Filter by catalog
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
        // Filter by specific datasets
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

    if (boundsParam !== null) {
      try {
        const parsedBounds = JSON.parse(boundsParam) as unknown;
        if (!isValidBounds(parsedBounds)) {
          throw new Error("Invalid bounds format");
        }
        const bounds = parsedBounds;
        where.and = [
          ...(Array.isArray(where.and) ? where.and : []),
          {
            "location.longitude": {
              greater_than_equal: bounds.west,
              less_than_equal: bounds.east,
            },
          },
          {
            "location.latitude": {
              greater_than_equal: bounds.south,
              less_than_equal: bounds.north,
            },
          },
        ];
      } catch (error) {
        logger.error("Invalid bounds parameter:", error);
      }
    }

    // Add date filtering - simplified
    if (startDate !== null || endDate !== null) {
      try {
        const dateFilters: Record<string, string> = {};

        if (startDate !== null) {
          const startDateTime = new Date(startDate);
          if (isNaN(startDateTime.getTime())) {
            throw new Error(`Invalid start date: ${startDate}`);
          }
          dateFilters.greater_than_equal = startDateTime.toISOString();
        }

        if (endDate !== null) {
          const endDateTime = new Date(endDate);
          if (isNaN(endDateTime.getTime())) {
            throw new Error(`Invalid end date: ${endDate}`);
          }
          // Add 1 day to include the entire end date
          endDateTime.setDate(endDateTime.getDate() + 1);
          dateFilters.less_than = endDateTime.toISOString();
        }

        // Skip database-level date filtering - we'll do post-processing instead
        // This allows us to include events with null eventTimestamp and filter by data fields
      } catch (error) {
        logger.error("Error processing date filters:", error);
        // Skip date filtering if there's an error
      }
    }

    const events = await payload.find({
      collection: "events",
      where,
      limit: 1000,
      depth: 2,
    });

    // Additional filtering by data fields (post-processing)
    let filteredEvents = events.docs;

    if (startDate !== null || endDate !== null) {
      const startDateTime = startDate !== null ? new Date(startDate) : null;
      const endDateTime = endDate !== null ? new Date(endDate) : null;
      if (endDateTime !== null) {
        endDateTime.setDate(endDateTime.getDate() + 1); // Include the entire end date
      }

      filteredEvents = events.docs.filter((event: Event) => {
        // Check eventTimestamp first
        if (
          event.eventTimestamp !== null &&
          event.eventTimestamp !== undefined
        ) {
          const eventDate = new Date(event.eventTimestamp);
          const matchesTimestamp =
            (!startDateTime || eventDate >= startDateTime) &&
            (!endDateTime || eventDate < endDateTime);
          if (matchesTimestamp) return true;
        }

        // If no eventTimestamp or eventTimestamp doesn't match, check data fields
        const commonDateFields = [
          "date",
          "startDate",
          "start_date",
          "eventDate",
          "event_date",
        ];

        for (const dateField of commonDateFields) {
          const eventData = event.data;
          if (
            eventData !== null &&
            typeof eventData === "object" &&
            !Array.isArray(eventData)
          ) {
            const dataDateValue = (eventData as Record<string, unknown>)[
              dateField
            ];
            if (dataDateValue != null && typeof dataDateValue === "string") {
              const dataDate = new Date(dataDateValue);
              if (!isNaN(dataDate.getTime())) {
                const matchesDataField =
                  (!startDateTime || dataDate >= startDateTime) &&
                  (!endDateTime || dataDate < endDateTime);
                if (matchesDataField) return true;
              }
            }
          }
        }

        return false;
      });
    }

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
