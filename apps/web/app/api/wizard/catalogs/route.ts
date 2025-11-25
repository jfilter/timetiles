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

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import { internalError, unauthorized } from "@/lib/utils/api-response";
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
export const GET = async (req: NextRequest) => {
  try {
    const payload = await getPayload({ config });

    // Get user from session
    const { user } = await payload.auth({ headers: req.headers });

    if (!user) {
      return unauthorized();
    }

    // Fetch user's catalogs
    const catalogsResult = await payload.find({
      collection: "catalogs",
      where: {
        createdBy: { equals: user.id },
      },
      limit: 100,
      sort: "-createdAt",
    });

    const catalogs: CatalogWithDatasets[] = [];

    // For each catalog, fetch its datasets
    for (const catalog of catalogsResult.docs) {
      const datasetsResult = await payload.find({
        collection: "datasets",
        where: {
          catalog: { equals: catalog.id },
        },
        limit: 100,
        sort: "title",
      });

      catalogs.push({
        id: catalog.id,
        name: catalog.name,
        datasets: datasetsResult.docs.map((ds) => ({
          id: ds.id,
          name: ds.name,
        })),
      });
    }

    logger.info("Catalogs fetched for wizard", {
      userId: user.id,
      catalogCount: catalogs.length,
    });

    return NextResponse.json({ catalogs });
  } catch (error) {
    logger.error("Failed to fetch catalogs", { error });
    return internalError("Failed to fetch catalogs");
  }
};
