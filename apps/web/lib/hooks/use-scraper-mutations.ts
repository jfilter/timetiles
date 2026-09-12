/**
 * React Query mutation hooks for scraper operations.
 *
 * Provides sync, run, and delete mutations for scraper repos and scrapers.
 *
 * @module
 * @category Hooks
 */
"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { fetchJson } from "../api/http-error";
import { createItemPollingInterval } from "./query-presets";

export const scraperKeys = {
  repos: ["scraper-repos"] as const,
  sync: (repoId: number | null) => ["scraper-repo-sync", repoId] as const,
  byRepo: (repoId?: number) => (repoId ? (["scrapers", "repo", repoId] as const) : (["scrapers"] as const)),
  runs: (scraperId?: number) =>
    scraperId ? (["scraper-runs", "scraper", scraperId] as const) : (["scraper-runs"] as const),
};

export const useSyncScraperRepoMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (repoId: number) => {
      return fetchJson<{ message: string }>(`/api/scraper-repos/${repoId}/sync`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: (_data, repoId) => {
      void queryClient.invalidateQueries({ queryKey: scraperKeys.sync(repoId) });
    },
  });

  const repoId = mutation.variables;
  const sync = useQuery({
    queryKey: scraperKeys.sync(repoId ?? null),
    queryFn:
      mutation.isSuccess && repoId != null
        ? () => fetchJson<{ pending: boolean }>(`/api/scraper-repos/${repoId}/sync`, { credentials: "include" })
        : skipToken,
    refetchOnWindowFocus: false,
    refetchInterval: createItemPollingInterval<{ pending: boolean }>((status) => status.pending, 5000),
  });

  useEffect(() => {
    if (mutation.isSuccess && !sync.isFetching && sync.data?.pending === false) {
      void queryClient.invalidateQueries({ queryKey: scraperKeys.repos });
      void queryClient.invalidateQueries({ queryKey: scraperKeys.byRepo() });
    }
  }, [mutation.isSuccess, sync.isFetching, sync.data?.pending, queryClient]);

  return {
    ...mutation,
    isPending: mutation.isPending || sync.isLoading || (mutation.isSuccess && sync.data?.pending === true),
    error: mutation.error ?? sync.error,
  };
};

export const useRunScraperMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scraperId: number) => {
      return fetchJson<{ message: string }>(`/api/scrapers/${scraperId}/run`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scraperKeys.byRepo() });
      void queryClient.invalidateQueries({ queryKey: scraperKeys.runs() });
    },
  });
};

export const useDeleteScraperRepoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (repoId: number) => {
      await fetchJson(`/api/scraper-repos/${repoId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scraperKeys.repos });
      void queryClient.invalidateQueries({ queryKey: scraperKeys.byRepo() });
    },
  });
};
