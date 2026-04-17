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
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { isValidFieldKey } from "@/lib/filters/field-validation";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toPayloadWhere } from "@/lib/filters/to-payload-where";
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
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
      return buildListResponse(buildEmptyQueryResult(query.limit));
    }

    if (requiresSqlFilteredPagination(ctx.filters)) {
      const result = await executeSqlFilteredEventsQuery(payload, ctx.filters, query, user);
      return buildListResponse(result);
    }

    const where = toPayloadWhere(ctx.filters);
    const result = await executeEventsQuery(payload, where, query, user);
    return buildListResponse(result);
  },
});

const requiresSqlFilteredPagination = (filters: CanonicalEventFilters): boolean =>
  (filters.fieldFilters != null && Object.keys(filters.fieldFilters).length > 0) ||
  (filters.clusterCells?.length ?? 0) > 0;

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

const SORTABLE_SQL_COLUMNS = {
  createdAt: sql.raw("e.created_at"),
  eventEndTimestamp: sql.raw("e.event_end_timestamp"),
  eventTimestamp: sql.raw("e.event_timestamp"),
  id: sql.raw("e.id"),
  locationName: sql.raw("e.location_name"),
  uniqueId: sql.raw("e.unique_id"),
  updatedAt: sql.raw("e.updated_at"),
  validationStatus: sql.raw("e.validation_status"),
} as const;

const buildSortExpression = (sortField: string) => {
  const sqlColumn = SORTABLE_SQL_COLUMNS[sortField as keyof typeof SORTABLE_SQL_COLUMNS];
  if (sqlColumn) {
    return sqlColumn;
  }

  if (isValidFieldKey(sortField)) {
    return sql`e.transformed_data #>> string_to_array(${sortField}, '.')`;
  }

  return SORTABLE_SQL_COLUMNS.eventTimestamp;
};

const buildOrderByClause = (sort: string) => {
  const isDescending = sort.startsWith("-");
  const sortField = sort.replace(/^-/, "");
  const sortExpression = buildSortExpression(sortField);

  if (sortField === "id") {
    return isDescending ? sql`${sortExpression} DESC` : sql`${sortExpression} ASC`;
  }

  return isDescending ? sql`${sortExpression} DESC, e.id DESC` : sql`${sortExpression} ASC, e.id ASC`;
};

const executeSqlFilteredEventsQuery = async (
  payload: Payload,
  filters: CanonicalEventFilters,
  query: EventListQuery,
  user?: User | null
) => {
  const whereClause = toSqlWhereClause(filters);
  const orderByClause = buildOrderByClause(query.sort);
  const offset = Math.max(0, (query.page - 1) * query.limit);

  const countPromise = payload.db.drizzle.execute(sql`
      SELECT COUNT(*)::integer as total
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
    `) as Promise<{ rows: Array<{ total: number }> }>;
  const pagePromise = payload.db.drizzle.execute(sql`
      SELECT e.id
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${query.limit}
      OFFSET ${offset}
    `) as Promise<{ rows: Array<{ id: number }> }>;

  const [countResult, pageResult] = await Promise.all([countPromise, pagePromise]);

  const totalDocs = Number(countResult.rows[0]?.total ?? 0);
  if (totalDocs === 0) {
    return buildPaginatedQueryResult([], query.page, query.limit, totalDocs);
  }

  const pageIds = pageResult.rows.map((row) => Number(row.id));
  if (pageIds.length === 0) {
    return buildPaginatedQueryResult([], query.page, query.limit, totalDocs);
  }

  const hydratedResult = await payload.find({
    collection: "events",
    where: { id: { in: pageIds } },
    limit: pageIds.length,
    depth: 1,
    user,
    overrideAccess: false,
  });

  const docsById = new Map(hydratedResult.docs.map((doc) => [doc.id, doc]));
  const docs = pageIds.map((id) => docsById.get(id)).filter((doc): doc is Event => doc != null);

  return buildPaginatedQueryResult(docs, query.page, query.limit, totalDocs);
};

const buildPaginatedQueryResult = (docs: Event[], page: number, limit: number, totalDocs: number) => {
  const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit);
  const hasPrevPage = totalDocs > 0 && page > 1;
  const hasNextPage = totalDocs > 0 && page < totalPages;

  return {
    docs,
    page,
    limit,
    totalDocs,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null,
  };
};

const buildEmptyQueryResult = (limit: number) => buildPaginatedQueryResult([], 1, limit, 0);

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
