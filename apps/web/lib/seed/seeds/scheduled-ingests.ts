/**
 * Seed data for the Scheduled Ingests collection.
 *
 * Creates sample scheduled ingest configurations for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface ExecutionHistoryEntry {
  executedAt: string;
  status: "success" | "failed";
  duration: number;
  recordsImported?: number;
  error?: string;
  triggeredBy: "schedule" | "manual" | "webhook";
}

export interface ScheduledIngestSeed {
  name: string;
  createdBy: string;
  sourceUrl: string;
  catalog: string;
  enabled: boolean;
  scheduleType: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode?: "strict" | "additive" | "flexible";
  lastRun?: string;
  nextRun?: string;
  lastStatus?: "success" | "failed" | "running";
  lastError?: string;
  statistics?: { totalRuns: number; successfulRuns: number; failedRuns: number; averageDuration: number };
  executionHistory?: ExecutionHistoryEntry[];
}

export const scheduledIngestSeeds = (environment: string): ScheduledIngestSeed[] => {
  if (environment !== "development") return [];

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  return [
    {
      name: "City Events Feed",
      createdBy: "admin@example.com",
      sourceUrl: "https://opendata.example.com/events.csv",
      catalog: "Environmental Data",
      enabled: true,
      scheduleType: "frequency",
      frequency: "daily",
      schemaMode: "additive",
      lastRun: yesterday.toISOString(),
      nextRun: tomorrow.toISOString(),
      lastStatus: "success",
      statistics: { totalRuns: 42, successfulRuns: 40, failedRuns: 2, averageDuration: 15000 },
      executionHistory: [
        {
          executedAt: yesterday.toISOString(),
          status: "success",
          duration: 14200,
          recordsImported: 87,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(2).toISOString(),
          status: "success",
          duration: 16100,
          recordsImported: 92,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(3).toISOString(),
          status: "success",
          duration: 13800,
          recordsImported: 78,
          triggeredBy: "manual",
        },
        {
          executedAt: daysAgo(4).toISOString(),
          status: "failed",
          duration: 30000,
          error: "Source returned HTTP 503 Service Unavailable",
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(5).toISOString(),
          status: "success",
          duration: 15400,
          recordsImported: 81,
          triggeredBy: "schedule",
        },
      ],
    },
    {
      name: "Weather Station Data",
      createdBy: "admin@example.com",
      sourceUrl: "https://api.weather.example.com/stations/export",
      catalog: "Environmental Data",
      enabled: true,
      scheduleType: "frequency",
      frequency: "hourly",
      schemaMode: "strict",
      lastRun: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      nextRun: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      lastStatus: "success",
      statistics: { totalRuns: 168, successfulRuns: 165, failedRuns: 3, averageDuration: 8000 },
      executionHistory: [
        {
          executedAt: hoursAgo(1).toISOString(),
          status: "success",
          duration: 7800,
          recordsImported: 24,
          triggeredBy: "schedule",
        },
        {
          executedAt: hoursAgo(2).toISOString(),
          status: "success",
          duration: 8200,
          recordsImported: 24,
          triggeredBy: "schedule",
        },
        {
          executedAt: hoursAgo(3).toISOString(),
          status: "success",
          duration: 7500,
          recordsImported: 23,
          triggeredBy: "schedule",
        },
        {
          executedAt: hoursAgo(4).toISOString(),
          status: "success",
          duration: 9100,
          recordsImported: 25,
          triggeredBy: "webhook",
        },
      ],
    },
    {
      name: "Economic Indicators Report",
      createdBy: "admin@example.com",
      sourceUrl: "https://data.worldbank.example.org/indicators.xlsx",
      catalog: "Economic Indicators",
      enabled: true,
      scheduleType: "frequency",
      frequency: "monthly",
      schemaMode: "flexible",
      lastRun: lastWeek.toISOString(),
      nextRun: new Date(now.getTime() + 23 * 24 * 60 * 60 * 1000).toISOString(),
      lastStatus: "success",
      statistics: { totalRuns: 6, successfulRuns: 6, failedRuns: 0, averageDuration: 45000 },
      executionHistory: [
        {
          executedAt: lastWeek.toISOString(),
          status: "success",
          duration: 42300,
          recordsImported: 312,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(37).toISOString(),
          status: "success",
          duration: 47800,
          recordsImported: 298,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(67).toISOString(),
          status: "success",
          duration: 44100,
          recordsImported: 305,
          triggeredBy: "manual",
        },
      ],
    },
    {
      name: "Research Publications Sync",
      createdBy: "admin@example.com",
      sourceUrl: "https://api.research.example.edu/publications.json",
      catalog: "Academic Research Portal",
      enabled: false,
      scheduleType: "cron",
      cronExpression: "0 6 * * 1",
      schemaMode: "strict",
      lastRun: lastWeek.toISOString(),
      lastStatus: "failed",
      lastError: "Connection timeout after 30s",
      statistics: { totalRuns: 12, successfulRuns: 10, failedRuns: 2, averageDuration: 25000 },
      executionHistory: [
        {
          executedAt: lastWeek.toISOString(),
          status: "failed",
          duration: 30000,
          error: "Connection timeout after 30s",
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(14).toISOString(),
          status: "failed",
          duration: 30000,
          error: "ECONNREFUSED: server refused connection on port 443",
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(21).toISOString(),
          status: "success",
          duration: 23400,
          recordsImported: 156,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(28).toISOString(),
          status: "success",
          duration: 26700,
          recordsImported: 148,
          triggeredBy: "manual",
        },
        {
          executedAt: daysAgo(35).toISOString(),
          status: "success",
          duration: 24100,
          recordsImported: 162,
          triggeredBy: "schedule",
        },
      ],
    },
    {
      name: "Transit Schedule Updates",
      createdBy: "admin@example.com",
      sourceUrl: "https://transit.example.gov/gtfs/schedule.csv",
      catalog: "Environmental Data",
      enabled: true,
      scheduleType: "frequency",
      frequency: "weekly",
      schemaMode: "additive",
      lastRun: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      nextRun: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      lastStatus: "success",
      statistics: { totalRuns: 24, successfulRuns: 23, failedRuns: 1, averageDuration: 32000 },
      executionHistory: [
        {
          executedAt: daysAgo(3).toISOString(),
          status: "success",
          duration: 31200,
          recordsImported: 1843,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(10).toISOString(),
          status: "success",
          duration: 33800,
          recordsImported: 1901,
          triggeredBy: "schedule",
        },
        {
          executedAt: daysAgo(17).toISOString(),
          status: "success",
          duration: 29700,
          recordsImported: 1756,
          triggeredBy: "webhook",
        },
      ],
    },
  ];
};
