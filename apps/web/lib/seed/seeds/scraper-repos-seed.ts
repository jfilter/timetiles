/**
 * Seed data for the Scraper Repos collection.
 *
 * Creates sample scraper repository records for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface ScraperRepoSeed {
  name: string;
  slug: string;
  createdBy: string;
  sourceType: "git" | "upload";
  gitUrl?: string;
  gitBranch?: string;
  catalog: string;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "failed";
}

export const scraperRepoSeeds = (environment: string): ScraperRepoSeed[] => {
  if (environment !== "development") return [];

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return [
    {
      name: "City Open Data Scrapers",
      slug: "city-open-data-scrapers",
      createdBy: "admin@example.com",
      sourceType: "git",
      gitUrl: "https://github.com/example-org/city-open-data-scrapers.git",
      gitBranch: "main",
      catalog: "Environmental Data",
      lastSyncAt: daysAgo(1).toISOString(),
      lastSyncStatus: "success",
    },
    {
      name: "Academic Data Collectors",
      slug: "academic-data-collectors",
      createdBy: "admin@example.com",
      sourceType: "git",
      gitUrl: "https://github.com/example-org/academic-data-collectors.git",
      gitBranch: "main",
      catalog: "Academic Research Portal",
      lastSyncAt: daysAgo(3).toISOString(),
      lastSyncStatus: "success",
    },
  ];
};
