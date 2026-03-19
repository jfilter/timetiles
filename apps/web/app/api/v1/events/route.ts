/**
 * This file defines the API route for fetching a list of events.
 *
 * It provides a flexible endpoint that allows clients to retrieve events based on a variety
 * of filters, including catalog, datasets, geographic bounds, and date ranges. The handler
 * uses the canonical filter pipeline to build a Payload CMS Where clause, with access control
 * enforced both through the filter model and Payload's built-in access control.
 *
 * @module
 */
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import { toPayloadWhere } from "@/lib/filters/to-payload-where";
import type { EventListItem, EventListQuery } from "@/lib/schemas/events";
import { EventListQuerySchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import type { Event, User } from "@/payload-types";
import { extractEventFields, extractFieldFromData } from "@/lib/utils/event-detail";

const getDatasetInfo = (dataset: Event["dataset"]) => {
  if (typeof dataset !== "object" || dataset == null) {
    return { id: dataset, title: undefined, catalog: undefined };
  }

  const catalogName = typeof dataset.catalog === "object" && dataset.catalog != null ? dataset.catalog.name : undefined;

  return { id: dataset.id, title: dataset.name, catalog: catalogName };
};

export const transformEvent = (event: Event): EventListItem => {
  // Extract field mappings from dataset
  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;

  // Extract title, description, and id using shared normalization
  const eventData = event.data;
  const { title, description } = extractEventFields(eventData, fieldMappings, event.id);
  const id = extractFieldFromData(eventData, "id");

  // Enrich data with extracted fields so UI can always access title/description/id
  // regardless of original field names (e.g., "titel" in German data becomes "title")
  if (typeof eventData !== "object" || eventData == null || Array.isArray(eventData)) {
    throw new Error(`Invalid event data: expected object, got ${typeof eventData}`);
  }
  const enrichedData = { ...eventData, title, description, id };

  return {
    id: event.id,
    dataset: getDatasetInfo(event.dataset),
    data: enrichedData,
    location:
      event.location?.longitude != null && event.location?.latitude != null
        ? { longitude: event.location.longitude, latitude: event.location.latitude }
        : null,
    eventTimestamp: event.eventTimestamp ?? "",
    isValid: event.validationStatus === "valid",
  };
};

export const GET = apiRoute({
  auth: "optional",
  query: EventListQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

    const filters = buildCanonicalFilters({ parameters: query, accessibleCatalogIds, requireLocation: true });

    const where = toPayloadWhere(filters);
    const result = await executeEventsQuery(payload, where, query, user);
    return buildListResponse(result);
  },
});

const executeEventsQuery = async (
  payload: Payload,
  where: ReturnType<typeof toPayloadWhere>,
  query: EventListQuery,
  user?: User | null
) =>
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
