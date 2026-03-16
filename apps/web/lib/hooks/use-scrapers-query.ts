/**
 * React Query hooks for fetching scraper repos, scrapers, and scraper runs.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { Scraper, ScraperRepo, ScraperRun } from "@/payload-types";

import { fetchJson } from "../api/http-error";
import { scraperKeys } from "./use-scraper-mutations";

interface PaginatedResponse<T> {
  docs: T[];
  totalDocs: number;
}

export const useScraperReposQuery = (initialData?: ScraperRepo[]) =>
  useQuery({
    queryKey: scraperKeys.repos,
    queryFn: async () => {
      const data = await fetchJson<PaginatedResponse<ScraperRepo>>("/api/scraper-repos?sort=-updatedAt&limit=200", {
        credentials: "include",
      });
      return data.docs;
    },
    initialData,
    staleTime: 60_000,
  });

export const useScrapersQuery = (repoId?: number) =>
  useQuery({
    queryKey: scraperKeys.byRepo(repoId),
    queryFn: async () => {
      const url = repoId
        ? `/api/scrapers?where[repo][equals]=${repoId}&sort=-updatedAt&limit=200`
        : "/api/scrapers?sort=-updatedAt&limit=200";
      const data = await fetchJson<PaginatedResponse<Scraper>>(url, { credentials: "include" });
      return data.docs;
    },
    staleTime: 60_000,
  });

export const useScraperRunsQuery = (scraperId?: number) =>
  useQuery({
    queryKey: scraperKeys.runs(scraperId),
    queryFn: async () => {
      const url = scraperId
        ? `/api/scraper-runs?where[scraper][equals]=${scraperId}&sort=-createdAt&limit=50`
        : "/api/scraper-runs?sort=-createdAt&limit=50";
      const data = await fetchJson<PaginatedResponse<ScraperRun>>(url, { credentials: "include" });
      return data.docs;
    },
    enabled: scraperId != null,
    staleTime: 30_000,
  });
