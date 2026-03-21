/**
 * Lightweight API endpoint for catalog and dataset names.
 *
 * Returns only the minimal data needed for filter dropdowns and labels:
 * - Catalogs: id, name
 * - Datasets: id, name, catalogId
 *
 * This is much more efficient than fetching full objects with all relationships.
 *
 * @module
 */
import { apiRoute } from "@/lib/api";
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/types/data-sources";
import { extractRelationId } from "@/lib/utils/relation-id";

export type { DataSourceCatalog, DataSourceDataset, DataSourcesResponse } from "@/lib/types/data-sources";

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user, payload }) => {
    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        limit: 500,
        pagination: false,
        select: { id: true, name: true, createdBy: true },
        user,
        overrideAccess: false,
      }),
      payload.find({
        collection: "datasets",
        limit: 5000,
        pagination: false,
        depth: 1, // Need depth to get catalog relationship
        select: { id: true, name: true, catalog: true },
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
    }));

    const datasets: DataSourceDataset[] = datasetsResult.docs.map((d) => ({
      id: d.id,
      name: d.name,
      catalogId: typeof d.catalog === "object" && d.catalog != null ? d.catalog.id : null,
    }));

    return { catalogs, datasets };
  },
});
