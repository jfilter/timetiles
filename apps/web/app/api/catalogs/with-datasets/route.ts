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

    // Count events per dataset
    const datasetIds = datasetsResult.docs.map((ds) => ds.id);
    const eventCounts = new Map<number, number>();

    if (datasetIds.length > 0) {
      await Promise.all(
        datasetIds.map(async (id) => {
          const count = await payload.count({ collection: "events", where: { dataset: { equals: id } } });
          eventCounts.set(id, count.totalDocs);
        })
      );
    }

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
