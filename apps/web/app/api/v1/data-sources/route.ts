/**
 * Lightweight API endpoint for catalog and dataset metadata.
 *
 * Returns the data needed for filter dropdowns, labels, and descriptions:
 * - Catalogs: id, name, description, ownership
 * - Datasets: id, name, description, language, catalogId, temporal flag
 *
 * @module
 */
import { apiRoute } from "@/lib/api";
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/types/data-sources";
import { extractRelationId } from "@/lib/utils/relation-id";
import { richTextToPlainText } from "@/lib/utils/rich-text";

export type { DataSourceCatalog, DataSourceDataset, DataSourcesResponse } from "@/lib/types/data-sources";

const DESCRIPTION_MAX_LENGTH = 120;

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user, payload }) => {
    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        limit: 500,
        pagination: false,
        select: { id: true, name: true, description: true, createdBy: true },
        user,
        overrideAccess: false,
      }),
      payload.find({
        collection: "datasets",
        limit: 5000,
        pagination: false,
        depth: 1, // Need depth to get catalog relationship
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
      catalogId: typeof d.catalog === "object" && d.catalog != null ? d.catalog.id : null,
      hasTemporalData: d.hasTemporalData ?? true,
      description: richTextToPlainText(d.description, DESCRIPTION_MAX_LENGTH),
      language: d.language ?? undefined,
    }));

    return { catalogs, datasets };
  },
});
