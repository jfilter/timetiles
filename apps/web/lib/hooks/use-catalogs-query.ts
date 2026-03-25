/**
 * React Query hook for fetching catalogs with their datasets.
 *
 * Used by the import wizard's dataset selection step.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";
import { QUERY_PRESETS } from "./query-presets";

export interface CatalogWithDatasets {
  id: number;
  name: string;
  datasets: Array<{ id: number; name: string; eventCount: number }>;
}

interface CatalogsResponse {
  catalogs: CatalogWithDatasets[];
}

const fetchCatalogs = () => fetchJson<CatalogsResponse>("/api/catalogs/with-datasets", { credentials: "include" });

export const catalogsQueryKeys = {
  all: ["catalogs"] as const,
  withDatasets: () => [...catalogsQueryKeys.all, "with-datasets"] as const,
};

export const useCatalogsQuery = () =>
  useQuery({ queryKey: catalogsQueryKeys.withDatasets(), queryFn: fetchCatalogs, ...QUERY_PRESETS.stable });
