/**
 * React Query mutation hooks for scraper operations.
 *
 * Provides sync, run, and delete mutations for scraper repos and scrapers.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";

export const scraperKeys = {
  repos: ["scraper-repos"] as const,
  byRepo: (repoId?: number) => (repoId ? (["scrapers", "repo", repoId] as const) : (["scrapers"] as const)),
  runs: (scraperId?: number) =>
    scraperId ? (["scraper-runs", "scraper", scraperId] as const) : (["scraper-runs"] as const),
};

export const useSyncScraperRepoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (repoId: number) => {
      return fetchJson<{ success: boolean; message: string }>(`/api/scraper-repos/${repoId}/sync`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scraperKeys.repos });
    },
  });
};

export const useRunScraperMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scraperId: number) => {
      return fetchJson<{ success: boolean; message: string }>(`/api/scrapers/${scraperId}/run`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      void queryClient.invalidateQueries({ queryKey: ["scraper-runs"] });
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
      void queryClient.invalidateQueries({ queryKey: ["scrapers"] });
    },
  });
};
