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
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toPayloadWhere } from "@/lib/filters/to-payload-where";
import { h3ColumnName, isValidH3CellId } from "@/lib/filters/to-sql-conditions";
import type { EventListItem, EventListQuery } from "@/lib/schemas/events";
import { EventListQuerySchema } from "@/lib/schemas/events";
import { extractEventFields, extractFieldFromData, getDatasetInfo } from "@/lib/utils/event-detail";
import type { Event, User } from "@/payload-types";

export const transformEvent = (event: Event): EventListItem => {
  // Extract field mappings from dataset
  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;

  // Extract title, description, and id using shared normalization
  const eventData = event.transformedData;
  const { title, description } = extractEventFields(eventData, fieldMappings, event.id);
  const id = extractFieldFromData(eventData, "id");

  // Enrich data with extracted fields so UI can always access title/description/id
  // regardless of original field names (e.g., "titel" in German data becomes "title")
  if (typeof eventData !== "object" || eventData == null || Array.isArray(eventData)) {
    throw new Error(`Invalid event data: expected object, got ${typeof eventData}`);
  }
  const enrichedData = { ...eventData, title, description, id };

  const datasetSummary = getDatasetInfo(event.dataset);
  const datasetInfo = datasetSummary ?? {
    id: typeof event.dataset === "number" ? event.dataset : 0,
    name: undefined,
    catalog: undefined,
  };

  return {
    id: event.id,
    dataset: datasetInfo,
    data: enrichedData,
    location:
      event.location?.longitude != null && event.location?.latitude != null
        ? { longitude: event.location.longitude, latitude: event.location.latitude }
        : null,
    locationName: event.locationName ?? null,
    geocodedAddress: event.geocodingInfo?.normalizedAddress ?? null,
    eventTimestamp: event.eventTimestamp ?? "",
    eventEndTimestamp: event.eventEndTimestamp ?? null,
    isValid: event.validationStatus === "valid",
  };
};

export const GET = apiRoute({
  auth: "optional",
  query: EventListQuerySchema,
  handler: async ({ query, user, payload }) => {
    const ctx = await resolveEventQueryContext({ payload, user, query, requireLocation: true });
    if (ctx.denied) {
      return buildListResponse({
        docs: [],
        page: 1,
        limit: query.limit,
        totalDocs: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }

    const where = toPayloadWhere(ctx.filters);

    // H3 cell filter: pre-fetch matching IDs via raw SQL (Payload doesn't know about h3_rN columns)
    if (ctx.filters.clusterCells?.length && ctx.filters.h3Resolution != null) {
      const col = h3ColumnName(ctx.filters.h3Resolution);
      const validCells = ctx.filters.clusterCells.filter(isValidH3CellId);
      if (validCells.length === 0) {
        return buildListResponse({
          docs: [],
          page: 1,
          limit: query.limit,
          totalDocs: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        });
      }
      const idResult = (await payload.db.drizzle.execute(sql`
        SELECT e.id FROM payload.events e
        WHERE ${sql.raw(col)}::text IN (${sql.join(
          validCells.map((c) => sql`${c}`),
          sql`, `
        )})
      `)) as { rows: Array<{ id: number }> };
      const ids = idResult.rows.map((r) => Number(r.id));
      if (ids.length === 0) {
        return buildListResponse({
          docs: [],
          page: 1,
          limit: query.limit,
          totalDocs: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        });
      }
      where.and = [...(Array.isArray(where.and) ? where.and : []), { id: { in: ids } }];
    }

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
