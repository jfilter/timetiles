/**
 * React Query hooks for fetching scraper repos, scrapers, and scraper runs.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { Scraper, ScraperRepo, ScraperRun } from "@/payload-types";

import { fetchCollectionDocs } from "./use-payload-collection-query";
import { scraperKeys } from "./use-scraper-mutations";

export const useScraperReposQuery = (initialData?: ScraperRepo[]) =>
  useQuery({
    queryKey: scraperKeys.repos,
    queryFn: () => fetchCollectionDocs<ScraperRepo>("/api/scraper-repos?sort=-updatedAt&limit=200"),
    initialData,
    staleTime: 60_000,
  });

export const useScrapersQuery = (repoId?: number) =>
  useQuery({
    queryKey: scraperKeys.byRepo(repoId),
    queryFn: () => {
      const url = repoId
        ? `/api/scrapers?where[repo][equals]=${repoId}&sort=-updatedAt&limit=200`
        : "/api/scrapers?sort=-updatedAt&limit=200";
      return fetchCollectionDocs<Scraper>(url);
    },
    staleTime: 60_000,
  });

export const useScraperRunsQuery = (scraperId?: number) =>
  useQuery({
    queryKey: scraperKeys.runs(scraperId),
    queryFn: () => {
      const url = scraperId
        ? `/api/scraper-runs?where[scraper][equals]=${scraperId}&sort=-createdAt&limit=50`
        : "/api/scraper-runs?sort=-createdAt&limit=50";
      return fetchCollectionDocs<ScraperRun>(url);
    },
    enabled: scraperId != null,
    staleTime: 30_000,
  });
