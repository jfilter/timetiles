/**
 * Lightweight API endpoint for catalog and dataset metadata.
 *
 * Returns the data needed for filter dropdowns, labels, and descriptions:
 * - Catalogs: id, name, description, ownership
 * - Datasets: id, name, description, language, catalogId, temporal flag
 *
 * @module
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/types/data-sources";
import { extractRelationId } from "@/lib/utils/relation-id";
import { richTextToPlainText } from "@/lib/utils/rich-text";

export type {
  DataSourceCatalog,
  DataSourceDataset,
  DataSourcesResponse,
  PaginatedDataSourcesResponse,
} from "@/lib/types/data-sources";

const DESCRIPTION_MAX_LENGTH = 120;
const DEFAULT_DATASET_PAGE = 1;
const DEFAULT_DATASET_LIMIT = 250;
const MAX_DATASET_LIMIT = 500;

const DataSourcesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_DATASET_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_DATASET_LIMIT).default(DEFAULT_DATASET_LIMIT),
});

const resolveCatalogId = (catalog: number | { id: number } | null | undefined): number | null => {
  if (typeof catalog === "number") {
    return catalog;
  }

  if (catalog && typeof catalog === "object") {
    return catalog.id;
  }

  return null;
};

export const GET = apiRoute({
  auth: "optional",
  query: DataSourcesQuerySchema,
  handler: async ({ query, user, payload }) => {
    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        // `pagination: false` does NOT lift a limit — the drizzle adapter only drops it at
        // `limit: 0`. With 500 the 501st catalog vanished from the response while its
        // datasets still arrived, and the selector groups by catalog, so those datasets
        // disappeared from the picker entirely.
        limit: 0,
        pagination: false,
        select: { id: true, name: true, description: true, createdBy: true },
        user,
        overrideAccess: false,
      }),
      payload.find({
        collection: "datasets",
        page: query.page,
        limit: query.limit,
        // The client fetches page 1, then pages 2..N in parallel and concatenates. Payload's
        // default `-createdAt` has no unique tiebreaker and bulk creation ties on the
        // millisecond, so without this a dataset could appear on two pages — or on none.
        sort: ["-createdAt", "-id"],
        depth: 0,
        select: { id: true, name: true, description: true, language: true, catalog: true, hasTemporalData: true },
        user,
        overrideAccess: false,
      }),
    ]);

    // Transform to lightweight format
    const userId = user?.id ?? null;
    const catalogs: DataSourceCatalog[] = catalogsResult.docs.map((c) => ({
      id: c.id,
      name: c.name,
      isOwned: userId != null && extractRelationId(c.createdBy) === userId,
      description: richTextToPlainText(c.description, DESCRIPTION_MAX_LENGTH),
    }));

    const datasets: DataSourceDataset[] = datasetsResult.docs.map((d) => ({
      id: d.id,
      name: d.name,
      catalogId: resolveCatalogId(d.catalog),
      hasTemporalData: d.hasTemporalData ?? true,
      description: richTextToPlainText(d.description, DESCRIPTION_MAX_LENGTH),
      language: d.language ?? undefined,
    }));

    return {
      catalogs,
      datasets,
      pagination: {
        page: datasetsResult.page ?? query.page,
        limit: datasetsResult.limit,
        totalDocs: datasetsResult.totalDocs,
        totalPages: datasetsResult.totalPages,
        hasNextPage: datasetsResult.hasNextPage,
        hasPrevPage: datasetsResult.hasPrevPage,
        nextPage: datasetsResult.nextPage,
        prevPage: datasetsResult.prevPage,
      },
    };
  },
});
