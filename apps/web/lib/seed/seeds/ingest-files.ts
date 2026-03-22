/**
 * Seed data for the Ingest Files collection.
 *
 * Creates sample import file records for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface IngestFileSeed {
  originalName: string;
  filename: string;
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  user: string;
  datasetsCount: number;
  datasetsProcessed: number;
  filesize: number;
  mimeType: string;
  uploadedAt: string;
  completedAt?: string;
}

export const ingestFileSeeds = (environment: string): IngestFileSeed[] => {
  if (environment !== "development") return [];

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  return [
    {
      originalName: "city-events-2026.csv",
      filename: "1742600000-a1b2c3d4.csv",
      status: "completed",
      user: "admin@example.com",
      datasetsCount: 1,
      datasetsProcessed: 1,
      filesize: 524288,
      mimeType: "text/csv",
      uploadedAt: daysAgo(5).toISOString(),
      completedAt: daysAgo(5).toISOString(),
    },
    {
      originalName: "weather-stations.xlsx",
      filename: "1742500000-e5f6g7h8.xlsx",
      status: "completed",
      user: "admin@example.com",
      datasetsCount: 2,
      datasetsProcessed: 2,
      filesize: 1048576,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      uploadedAt: daysAgo(3).toISOString(),
      completedAt: daysAgo(3).toISOString(),
    },
    {
      originalName: "museum-exhibits.csv",
      filename: "1742400000-i9j0k1l2.csv",
      status: "completed",
      user: "admin@example.com",
      datasetsCount: 1,
      datasetsProcessed: 1,
      filesize: 262144,
      mimeType: "text/csv",
      uploadedAt: daysAgo(1).toISOString(),
      completedAt: daysAgo(1).toISOString(),
    },
    {
      originalName: "broken-economic-data.csv",
      filename: "1742300000-m3n4o5p6.csv",
      status: "failed",
      user: "admin@example.com",
      datasetsCount: 1,
      datasetsProcessed: 0,
      filesize: 819200,
      mimeType: "text/csv",
      uploadedAt: daysAgo(2).toISOString(),
    },
    {
      originalName: "transit-routes-update.csv",
      filename: "1742700000-q7r8s9t0.csv",
      status: "processing",
      user: "admin@example.com",
      datasetsCount: 1,
      datasetsProcessed: 0,
      filesize: 2097152,
      mimeType: "text/csv",
      uploadedAt: hoursAgo(2).toISOString(),
    },
  ];
};
