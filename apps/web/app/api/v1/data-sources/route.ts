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
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import config from "@/payload.config";

export interface DataSourceCatalog {
  id: number;
  name: string;
}

export interface DataSourceDataset {
  id: number;
  name: string;
  catalogId: number | null;
}

export interface DataSourcesResponse {
  catalogs: DataSourceCatalog[];
  datasets: DataSourceDataset[];
}

export const GET = async (): Promise<NextResponse<DataSourcesResponse | { error: string }>> => {
  try {
    const payload = await getPayload({ config });

    const [catalogsResult, datasetsResult] = await Promise.all([
      payload.find({
        collection: "catalogs",
        limit: 500,
        pagination: false,
        select: { id: true, name: true },
      }),
      payload.find({
        collection: "datasets",
        limit: 5000,
        pagination: false,
        depth: 1, // Need depth to get catalog relationship
        select: { id: true, name: true, catalog: true },
      }),
    ]);

    // Transform to lightweight format
    const catalogs: DataSourceCatalog[] = catalogsResult.docs.map((c) => ({
      id: c.id,
      name: c.name,
    }));

    const datasets: DataSourceDataset[] = datasetsResult.docs.map((d) => ({
      id: d.id,
      name: d.name,
      catalogId: typeof d.catalog === "object" && d.catalog != null ? d.catalog.id : null,
    }));

    return NextResponse.json({ catalogs, datasets });
  } catch (error) {
    logError(error, "Failed to fetch data sources");
    return NextResponse.json({ error: "Failed to fetch data sources" }, { status: 500 });
  }
};
