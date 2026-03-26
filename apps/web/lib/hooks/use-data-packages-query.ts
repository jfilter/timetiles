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
import type { DataPackageListItem } from "@/lib/types/data-packages";

import { QUERY_PRESETS } from "./query-presets";

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
    mutationFn: async ({ slug, triggerFirstImport = true }: { slug: string; triggerFirstImport?: boolean }) => {
      return fetchJson<ActivateResult>(`/api/data-packages/${slug}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ triggerFirstImport }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataPackageKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: dataPackageKeys.all });
    },
  });
};
