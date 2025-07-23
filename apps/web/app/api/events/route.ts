import { NextRequest, NextResponse } from "next/server";
import { getPayloadHMR } from "@payloadcms/next/utilities";
import type { Where } from "payload";
import type { Event } from "../../../payload-types";
import config from "../../../payload.config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    // Use global test payload instance if available (for tests)
    const payload =
      (global as any).__TEST_PAYLOAD__ || (await getPayloadHMR({ config }));
    const searchParams = request.nextUrl.searchParams;

    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const boundsParam = searchParams.get("bounds");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Where = {};

    if (catalog || (datasets.length > 0 && datasets[0] !== "")) {
      if (catalog && (datasets.length === 0 || datasets[0] === "")) {
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

    if (boundsParam) {
      try {
        const bounds = JSON.parse(boundsParam);
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
    if (startDate || endDate) {
      try {
        const dateFilters: Record<string, string> = {};

        if (startDate) {
          const startDateTime = new Date(startDate);
          if (isNaN(startDateTime.getTime())) {
            throw new Error(`Invalid start date: ${startDate}`);
          }
          dateFilters.greater_than_equal = startDateTime.toISOString();
        }

        if (endDate) {
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

    if (startDate || endDate) {
      const startDateTime = startDate ? new Date(startDate) : null;
      const endDateTime = endDate ? new Date(endDate) : null;
      if (endDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1); // Include the entire end date
      }

      filteredEvents = events.docs.filter((event: Event) => {
        // Check eventTimestamp first
        if (event.eventTimestamp) {
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
            eventData &&
            typeof eventData === "object" &&
            !Array.isArray(eventData) &&
            eventData !== null
          ) {
            const dataDateValue = (eventData as Record<string, unknown>)[
              dateField
            ];
            if (dataDateValue && typeof dataDateValue === "string") {
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
      docs: filteredEvents.map((event: any) => ({
        id: event.id,
        data: event.data,
        location: {
          longitude: event.location?.longitude || null,
          latitude: event.location?.latitude || null,
        },
        eventTimestamp: event.eventTimestamp,
        dataset:
          typeof event.dataset === "object" ? event.dataset.id : event.dataset,
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
