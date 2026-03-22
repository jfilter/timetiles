/**
 * Seed data for the Scrapers collection.
 *
 * Creates sample scraper definitions linked to scraper repos for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface ScraperSeed {
  name: string;
  slug: string;
  repo: string;
  repoCreatedBy: number;
  runtime: "python" | "node";
  entrypoint: string;
  schedule?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: "success" | "failed" | "timeout" | "running";
  statistics?: Record<string, unknown>;
}

export const scraperSeeds = (environment: string): ScraperSeed[] => {
  if (environment !== "development") return [];

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  return [
    {
      name: "Air Quality Monitor Scraper",
      slug: "air-quality-monitor-scraper",
      repo: "City Open Data Scrapers",
      repoCreatedBy: 1,
      runtime: "python",
      entrypoint: "scrapers/air_quality.py",
      schedule: "0 */6 * * *",
      enabled: true,
      lastRunAt: hoursAgo(6).toISOString(),
      lastRunStatus: "success",
      statistics: { totalRuns: 48, successRuns: 46, failedRuns: 2 },
    },
    {
      name: "Transit GTFS Fetcher",
      slug: "transit-gtfs-fetcher",
      repo: "City Open Data Scrapers",
      repoCreatedBy: 1,
      runtime: "node",
      entrypoint: "scrapers/transit-gtfs.js",
      schedule: "0 4 * * 1",
      enabled: true,
      lastRunAt: daysAgo(2).toISOString(),
      lastRunStatus: "success",
      statistics: { totalRuns: 12, successRuns: 11, failedRuns: 1 },
    },
    {
      name: "Research Paper Indexer",
      slug: "research-paper-indexer",
      repo: "Academic Data Collectors",
      repoCreatedBy: 1,
      runtime: "python",
      entrypoint: "indexer/main.py",
      schedule: "0 2 * * *",
      enabled: false,
      lastRunAt: daysAgo(5).toISOString(),
      lastRunStatus: "timeout",
      statistics: { totalRuns: 30, successRuns: 24, failedRuns: 6 },
    },
  ];
};
