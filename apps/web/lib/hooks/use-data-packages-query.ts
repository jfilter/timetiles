/**
 * React Query hooks for data packages.
 *
 * Provides query and mutation hooks for listing, activating, and
 * deactivating curated data packages.
 *
 * @module
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";
import type { DataPackageListItem } from "@/lib/data-packages/types";

import { QUERY_PRESETS } from "./query-presets";
import { catalogsQueryKeys } from "./use-catalogs-query";
import { dataSourcesKeys } from "./use-data-sources-query";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

interface DataPackagesResponse {
  packages: DataPackageListItem[];
}

interface ActivateResult {
  catalogId: number;
  datasetId: number;
  scheduledIngestId: number;
}

export const dataPackageKeys = { all: ["data-packages"] as const };

export const useDataPackagesQuery = () =>
  useQuery({
    queryKey: dataPackageKeys.all,
    queryFn: () => fetchJson<DataPackagesResponse>("/api/data-packages"),
    ...QUERY_PRESETS.stable,
  });

export const useActivateDataPackageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slug,
      triggerFirstImport = true,
      parameters,
    }: {
      slug: string;
      triggerFirstImport?: boolean;
      parameters?: Record<string, string>;
    }) => {
      return fetchJson<ActivateResult>(`/api/data-packages/${slug}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ triggerFirstImport, parameters }),
      });
    },
    onSuccess: () => {
      // Activation creates a catalog, a dataset and a scheduled ingest.
      for (const queryKey of [
        dataPackageKeys.all,
        catalogsQueryKeys.all,
        dataSourcesKeys.all,
        scheduledIngestKeys.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
};

export const useDeactivateDataPackageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string) => {
      await fetchJson(`/api/data-packages/${slug}/deactivate`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      // Deactivation disables the package's scheduled ingests.
      void queryClient.invalidateQueries({ queryKey: dataPackageKeys.all });
      void queryClient.invalidateQueries({ queryKey: scheduledIngestKeys.all });
    },
  });
};
