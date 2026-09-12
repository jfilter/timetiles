/**
 * React Query hooks for fetching scraper repos, scrapers, and scraper runs.
 *
 * @module
 * @category Hooks
 */
"use client";

import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { Scraper, ScraperRepo, ScraperRun } from "@/payload-types";

import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";
import { useAuthState } from "./use-auth-queries";
import { scraperKeys } from "./use-scraper-mutations";

export const useScraperReposQuery = (initialData?: ScraperRepo[]) => {
  const { userId } = useAuthState();
  return useQuery({
    queryKey: [...scraperKeys.repos, "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () =>
            fetchCollectionDocs<ScraperRepo>(
              `/api/scraper-repos?sort=-updatedAt&limit=200&where[createdBy][equals]=${userId}`
            ),
    initialData: userId == null ? undefined : initialData,
    ...QUERY_PRESETS.standard,
  });
};

const POLL_INTERVAL = 5000;

export const useScrapersQuery = (repoId?: number, initialData?: Scraper[]) => {
  const { userId } = useAuthState();
  return useQuery({
    queryKey: [...scraperKeys.byRepo(repoId), "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () => {
            const url = repoId
              ? `/api/scrapers?where[repo][equals]=${repoId}&sort=-updatedAt&limit=200`
              : "/api/scrapers?sort=-updatedAt&limit=200";
            return fetchCollectionDocs<Scraper>(`${url}&where[repoCreatedBy][equals]=${userId}`);
          },
    initialData: userId == null ? undefined : initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<Scraper>((d) => d.lastRunStatus === "running", POLL_INTERVAL),
  });
};

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
    ...QUERY_PRESETS.frequent,
    // Poll while any run is still in flight so the expanded run log advances to
    // its terminal status/duration instead of showing a stale "running"/"queued"
    // until the panel is re-opened (the summary card polls via useScrapersQuery).
    refetchInterval: createActivePollingInterval<ScraperRun>(
      (r) => r.status === "running" || r.status === "queued",
      POLL_INTERVAL
    ),
  });
