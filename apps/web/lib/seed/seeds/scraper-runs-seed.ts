/**
 * Seed data for the Scraper Runs collection.
 *
 * Creates sample scraper execution history records for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface ScraperRunSeed {
  scraper: string;
  scraperOwner: number;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  triggeredBy: "schedule" | "manual" | "webhook";
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  outputRows?: number;
  outputBytes?: number;
}

export const scraperRunSeeds = (environment: string): ScraperRunSeed[] => {
  if (environment !== "development") return [];

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const minutesAfter = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60 * 1000);

  const aqStart1 = hoursAgo(6);
  const aqStart2 = hoursAgo(12);
  const aqStart3 = daysAgo(1);
  const transitStart1 = daysAgo(2);
  const transitStart2 = daysAgo(9);
  const researchStart1 = daysAgo(5);
  const researchStart2 = daysAgo(6);
  const aqStart4 = daysAgo(2);

  return [
    {
      scraper: "Air Quality Monitor Scraper",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "schedule",
      startedAt: aqStart1.toISOString(),
      finishedAt: minutesAfter(aqStart1, 3).toISOString(),
      durationMs: 182400,
      exitCode: 0,
      stdout: "Fetched 24 monitoring stations\nParsed 576 readings\nWritten to data.csv",
      outputRows: 576,
      outputBytes: 45312,
    },
    {
      scraper: "Air Quality Monitor Scraper",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "schedule",
      startedAt: aqStart2.toISOString(),
      finishedAt: minutesAfter(aqStart2, 4).toISOString(),
      durationMs: 215600,
      exitCode: 0,
      stdout: "Fetched 24 monitoring stations\nParsed 582 readings\nWritten to data.csv",
      outputRows: 582,
      outputBytes: 46104,
    },
    {
      scraper: "Air Quality Monitor Scraper",
      scraperOwner: 1,
      status: "failed",
      triggeredBy: "schedule",
      startedAt: aqStart3.toISOString(),
      finishedAt: minutesAfter(aqStart3, 1).toISOString(),
      durationMs: 62000,
      exitCode: 1,
      stderr:
        "requests.exceptions.ConnectionError: HTTPSConnectionPool(host='api.airquality.example.gov', port=443): Max retries exceeded",
      error: "Connection error: upstream API unavailable",
    },
    {
      scraper: "Air Quality Monitor Scraper",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "manual",
      startedAt: aqStart4.toISOString(),
      finishedAt: minutesAfter(aqStart4, 3).toISOString(),
      durationMs: 194200,
      exitCode: 0,
      stdout: "Fetched 24 monitoring stations\nParsed 564 readings\nWritten to data.csv",
      outputRows: 564,
      outputBytes: 44832,
    },
    {
      scraper: "Transit GTFS Fetcher",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "schedule",
      startedAt: transitStart1.toISOString(),
      finishedAt: minutesAfter(transitStart1, 8).toISOString(),
      durationMs: 487200,
      exitCode: 0,
      stdout:
        "Downloaded GTFS feed (12.4 MB)\nParsed stops.txt: 1843 entries\nParsed routes.txt: 92 entries\nWritten to data.csv",
      outputRows: 1843,
      outputBytes: 289024,
    },
    {
      scraper: "Transit GTFS Fetcher",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "webhook",
      startedAt: transitStart2.toISOString(),
      finishedAt: minutesAfter(transitStart2, 9).toISOString(),
      durationMs: 524800,
      exitCode: 0,
      stdout:
        "Downloaded GTFS feed (11.8 MB)\nParsed stops.txt: 1812 entries\nParsed routes.txt: 91 entries\nWritten to data.csv",
      outputRows: 1812,
      outputBytes: 282368,
    },
    {
      scraper: "Research Paper Indexer",
      scraperOwner: 1,
      status: "timeout",
      triggeredBy: "schedule",
      startedAt: researchStart1.toISOString(),
      finishedAt: minutesAfter(researchStart1, 5).toISOString(),
      durationMs: 300000,
      exitCode: 137,
      stderr: "Process killed: exceeded 300s timeout\nPartial output: 42 papers indexed before timeout",
      error: "Execution exceeded timeout of 300 seconds",
    },
    {
      scraper: "Research Paper Indexer",
      scraperOwner: 1,
      status: "success",
      triggeredBy: "manual",
      startedAt: researchStart2.toISOString(),
      finishedAt: minutesAfter(researchStart2, 4).toISOString(),
      durationMs: 247800,
      exitCode: 0,
      stdout: "Connected to research API\nIndexed 156 papers\nResolved 312 author affiliations\nWritten to data.csv",
      outputRows: 156,
      outputBytes: 98304,
    },
  ];
};
