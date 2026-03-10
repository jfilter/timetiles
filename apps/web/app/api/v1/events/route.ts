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
import type { Payload, Where } from "payload";

import { apiRoute } from "@/lib/api";
import type { MapBounds } from "@/lib/geospatial";
import type { EventListQuery } from "@/lib/schemas/events";
import { EventListQuerySchema } from "@/lib/schemas/events";
import { normalizeEndDate } from "@/lib/services/aggregation-filters";
import type { Event, User } from "@/payload-types";

const addCatalogFilter = (where: Where, catalogId: number) => {
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "dataset.catalog": {
        equals: catalogId,
      },
    },
  ];
};

const addDatasetFilter = (where: Where, datasetIds: number[]) => {
  if (datasetIds.length === 0) {
    // All provided IDs were invalid -- return no results instead of all events
    where.and = [...(Array.isArray(where.and) ? where.and : []), { id: { equals: -1 } }];
    return;
  }

  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      dataset: {
        in: datasetIds,
      },
    },
  ];
};

const addBoundsFilter = (where: Where, bounds: MapBounds) => {
  const longitudeFilter =
    bounds.west <= bounds.east
      ? [
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
        ]
      : [
          {
            or: [
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
            ],
          },
        ];

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
    ...longitudeFilter,
  ];
};

const addDateFilter = (where: Where, startDate: string | undefined, endDate: string | null) => {
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

const addFieldFilters = (where: Where, fieldFilters: Record<string, string[]>) => {
  for (const [fieldPath, values] of Object.entries(fieldFilters)) {
    if (values.length === 0) continue;

    // Query the JSON data field using Payload's nested field syntax
    where.and = [
      ...(Array.isArray(where.and) ? where.and : []),
      {
        [`data.${fieldPath}`]: {
          in: values,
        },
      },
    ];
  }
};

const extractFieldFromData = (data: unknown, path: string | null | undefined): string | null => {
  if (!path || typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const value = (data as Record<string, unknown>)[path];
  if (value === null || value === undefined) return null;
  // Only convert primitives to string, not objects
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const getDatasetInfo = (dataset: Event["dataset"]) => {
  if (typeof dataset !== "object" || dataset == null) {
    return { id: dataset, title: undefined, catalog: undefined };
  }

  const catalogName = typeof dataset.catalog === "object" && dataset.catalog != null ? dataset.catalog.name : undefined;

  return {
    id: dataset.id,
    title: dataset.name,
    catalog: catalogName,
  };
};

const enrichEventData = (
  eventData: Event["data"],
  title: string | null,
  description: string | null,
  id: string | null
): { [k: string]: unknown } => {
  // Event data should always be an object from CSV/Excel import
  if (typeof eventData !== "object" || eventData == null || Array.isArray(eventData)) {
    throw new Error(`Invalid event data: expected object, got ${typeof eventData}`);
  }

  return { ...eventData, title, description, id };
};

const transformEvent = (event: Event) => {
  // Extract field mappings from dataset
  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;

  // Extract title, description, and id using field mappings
  const eventData = event.data;
  const title =
    extractFieldFromData(eventData, fieldMappings?.titlePath) ??
    extractFieldFromData(eventData, "title") ??
    extractFieldFromData(eventData, "name") ??
    `Event ${event.id}`;
  const description =
    extractFieldFromData(eventData, fieldMappings?.descriptionPath) ?? extractFieldFromData(eventData, "description");
  const id = extractFieldFromData(eventData, "id");

  // Enrich data with extracted fields so UI can always access title/description/id
  // regardless of original field names (e.g., "titel" in German data becomes "title")
  const enrichedData = enrichEventData(eventData, title, description, id);

  return {
    id: event.id,
    dataset: getDatasetInfo(event.dataset),
    data: enrichedData,
    location: event.location
      ? {
          longitude: event.location.longitude,
          latitude: event.location.latitude,
        }
      : null,
    eventTimestamp: event.eventTimestamp,
    isValid: event.validationStatus === "valid",
  };
};

export const GET = apiRoute({
  auth: "optional",
  query: EventListQuerySchema,
  handler: async ({ query, user, payload }) => {
    const where = buildWhereClause(query);
    const result = await executeEventsQuery(payload, where, query, user);
    const response = buildListResponse(result);

    return Response.json(response);
  },
});

const addLocationExistsFilter = (where: Where) => {
  // Only include events that have geocoded locations
  // Events without coordinates cannot be displayed on the map
  where.and = [
    ...(Array.isArray(where.and) ? where.and : []),
    {
      "location.latitude": {
        exists: true,
      },
    },
    {
      "location.longitude": {
        exists: true,
      },
    },
  ];
};

const buildWhereClause = (query: EventListQuery): Where => {
  const where: Where = {};

  addFiltersToWhere(where, query);
  addLocationExistsFilter(where);
  addBoundsToWhere(where, query.bounds ?? null);
  addDateFiltersToWhere(where, query.startDate, query.endDate);

  return where;
};

const addFiltersToWhere = (where: Where, query: EventListQuery) => {
  const { catalog, datasets, ff } = query;
  if (catalog != null || (datasets != null && datasets.length > 0)) {
    if (catalog != null && (datasets == null || datasets.length === 0)) {
      addCatalogFilter(where, catalog);
    }
    if (datasets != null && datasets.length > 0) {
      addDatasetFilter(where, datasets);
    }
  }

  // Add field filters if any
  if (ff && Object.keys(ff).length > 0) {
    addFieldFilters(where, ff);
  }
};

const addBoundsToWhere = (where: Where, bounds: MapBounds | null) => {
  if (bounds != null) {
    addBoundsFilter(where, bounds);
  }
};

const addDateFiltersToWhere = (where: Where, startDate: string | undefined, endDate: string | undefined) => {
  const normalizedEndDate = normalizeEndDate(endDate ?? null);

  if (startDate != null || normalizedEndDate != null) {
    addDateFilter(where, startDate, normalizedEndDate);
  }
};

const executeEventsQuery = async (payload: Payload, where: Where, query: EventListQuery, user?: User | null) =>
  payload.find({
    collection: "events",
    where,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    depth: 1,
    user,
    overrideAccess: false,
  });

const buildListResponse = (result: {
  docs: Event[];
  page?: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number | null;
  prevPage?: number | null;
}) => ({
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
