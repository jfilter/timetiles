/**
 * API endpoint for listing user's catalogs.
 *
 * GET /api/wizard/catalogs - Get user's catalogs with their datasets
 *
 * Returns catalogs and datasets owned by the authenticated user for
 * the import wizard dataset selection step.
 *
 * @module
 * @category API Routes
 */

import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

const logger = createLogger("api-wizard-catalogs");

interface CatalogWithDatasets {
  id: number;
  name: string;
  datasets: Array<{ id: number; name: string }>;
}

/**
 * Get user's catalogs with datasets.
 *
 * Returns all catalogs owned by the authenticated user along with
 * their associated datasets for use in the import wizard.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });
    const user = req.user!;

    // Fetch user's catalogs and datasets in parallel (2 queries instead of N+1)
    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        where: { createdBy: { equals: user.id } },
        limit: 100,
        sort: "-createdAt",
        select: { id: true, name: true },
      }),
      payload.find({
        collection: "datasets",
        where: { "catalog.createdBy": { equals: user.id } },
        limit: 1000,
        depth: 1,
        select: { id: true, name: true, catalog: true },
      }),
    ]);

    // Group datasets by catalog ID
    const datasetsByCatalog = new Map<number, Array<{ id: number; name: string }>>();
    for (const ds of datasetsResult.docs) {
      const catalogId = typeof ds.catalog === "object" && ds.catalog != null ? ds.catalog.id : null;
      if (catalogId != null) {
        const existing = datasetsByCatalog.get(catalogId) ?? [];
        existing.push({ id: ds.id, name: ds.name });
        datasetsByCatalog.set(catalogId, existing);
      }
    }

    // Build response with datasets grouped by catalog
    const catalogs: CatalogWithDatasets[] = catalogsResult.docs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      datasets: datasetsByCatalog.get(catalog.id) ?? [],
    }));

    logger.info("Catalogs fetched for wizard", {
      userId: user.id,
      catalogCount: catalogs.length,
    });

    return NextResponse.json({ catalogs });
  } catch (error) {
    logger.error("Failed to fetch catalogs", { error });
    return internalError("Failed to fetch catalogs");
  }
});
