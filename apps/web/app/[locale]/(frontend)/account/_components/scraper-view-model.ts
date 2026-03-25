/**
 * Shared view-model utilities for scraper table and card-list views.
 *
 * Centralizes status badge logic, repo-to-row flattening, and row types
 * so the table and list components only own their layout.
 *
 * @module
 * @category Components
 */
import type { StatusVariant } from "@/components/ui/status-badge";
import type { Scraper, ScraperRepo } from "@/payload-types";

/** Flat row combining scraper data with its repo name — used by the table view. */
export interface ScraperRow {
  scraper: Scraper;
  repoName: string;
  repoId: number;
}

/** Determine the StatusBadge variant for a scraper run status. */
export const getScraperStatusVariant = (status: Scraper["lastRunStatus"]): StatusVariant => {
  if (!status) return "muted";
  if (status === "running") return "info";
  if (status === "success") return "success";
  if (status === "timeout") return "warning";
  return "error";
};

/** Build a Map of repo ID → repo for efficient lookups. */
export const buildRepoMap = (repos: ScraperRepo[]): Map<number, ScraperRepo> => {
  const map = new Map<number, ScraperRepo>();
  for (const repo of repos) {
    map.set(repo.id, repo);
  }
  return map;
};

/** Extract the numeric repo ID from a scraper's repo relation. */
export const getScraperRepoId = (scraper: Scraper): number =>
  typeof scraper.repo === "object" ? scraper.repo.id : scraper.repo;

/** Flatten scrapers into ScraperRow[] using a repo map. */
export const flattenScraperRows = (scrapers: Scraper[], repoMap: Map<number, ScraperRepo>): ScraperRow[] =>
  scrapers.map((scraper) => {
    const repoId = getScraperRepoId(scraper);
    const repo = repoMap.get(repoId);
    return { scraper, repoName: repo?.name ?? String(repoId), repoId };
  });

/** Group scrapers by repo ID. */
export const groupScrapersByRepo = (scrapers: Scraper[]): Record<number, Scraper[]> =>
  scrapers.reduce<Record<number, Scraper[]>>((acc, scraper) => {
    const repoId = getScraperRepoId(scraper);
    acc[repoId] ??= [];
    acc[repoId].push(scraper);
    return acc;
  }, {});
