/**
 * Returns the authenticated user's catalogs with their datasets grouped by catalog.
 *
 * Used by the import wizard dataset selection step to show catalogs and their
 * associated datasets in a hierarchical view.
 *
 * GET /api/catalogs/with-datasets
 *
 * @module
 * @category API Routes
 */
import { apiRoute } from "@/lib/api";
import { fetchDatasetEventCounts } from "@/lib/database/filtered-events-query";
import { createLogger } from "@/lib/logger";

const catalogLogger = createLogger("catalogs-with-datasets");

export const GET = apiRoute({
  auth: "required",
  handler: async ({ payload, user }) => {
    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        where: { createdBy: { equals: user.id } },
        limit: 100,
        pagination: false,
        sort: "-createdAt",
        select: { id: true, name: true },
      }),
      payload.find({
        collection: "datasets",
        where: { "catalog.createdBy": { equals: user.id } },
        limit: 1000,
        pagination: false,
        depth: 1,
        select: { id: true, name: true, catalog: true },
      }),
    ]);

    // Count events per dataset in a single GROUP BY query instead of N+1 individual counts
    const datasetIds = datasetsResult.docs.map((ds) => ds.id);
    const eventCounts = await fetchDatasetEventCounts(payload, datasetIds);

    // Group datasets by catalog ID
    const datasetsByCatalog = new Map<number, Array<{ id: number; name: string; eventCount: number }>>();
    for (const ds of datasetsResult.docs) {
      const catalogId = typeof ds.catalog === "object" && ds.catalog != null ? ds.catalog.id : null;
      if (catalogId != null) {
        const existing = datasetsByCatalog.get(catalogId) ?? [];
        existing.push({ id: ds.id, name: ds.name, eventCount: eventCounts.get(ds.id) ?? 0 });
        datasetsByCatalog.set(catalogId, existing);
      }
    }

    const catalogs = catalogsResult.docs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      datasets: datasetsByCatalog.get(catalog.id) ?? [],
    }));

    catalogLogger.info("Catalogs fetched with datasets", { userId: user.id, catalogCount: catalogs.length });

    return { catalogs };
  },
});
