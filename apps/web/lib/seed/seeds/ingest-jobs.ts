/**
 * Seed data for the Ingest Jobs collection.
 *
 * Creates sample import job records linked to ingest files for the import activity dashboard.
 * Only seeded in development environment to populate the dashboard with demo data.
 *
 * @module
 */

export interface IngestJobSeed {
  ingestFile: string;
  dataset: string;
  stage: string;
  progress?: Record<string, unknown>;
  results?: Record<string, unknown>;
  errors?: Array<{ row: number; error: string }>;
  retryAttempts?: number;
}

export const ingestJobSeeds = (environment: string): IngestJobSeed[] => {
  if (environment !== "development") return [];

  return [
    {
      ingestFile: "city-events-2026.csv",
      dataset: "Air Quality Measurements",
      stage: "completed",
      progress: {
        overallPercentage: 100,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 1200 },
          "detect-schema": { status: "completed", duration: 2400 },
          "validate-schema": { status: "completed", duration: 800 },
          "geocode-batch": { status: "completed", duration: 8500 },
          "create-events": { status: "completed", duration: 4200 },
        },
      },
      results: { totalEvents: 342, created: 338, skipped: 4, geocoded: 312 },
    },
    {
      ingestFile: "weather-stations.xlsx",
      dataset: "Water Quality Assessments",
      stage: "completed",
      progress: {
        overallPercentage: 100,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 900 },
          "detect-schema": { status: "completed", duration: 3100 },
          "validate-schema": { status: "completed", duration: 600 },
          "geocode-batch": { status: "completed", duration: 12400 },
          "create-events": { status: "completed", duration: 6800 },
        },
      },
      results: { totalEvents: 587, created: 581, skipped: 6, geocoded: 571 },
    },
    {
      ingestFile: "weather-stations.xlsx",
      dataset: "Climate Station Data",
      stage: "completed",
      progress: {
        overallPercentage: 100,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 700 },
          "detect-schema": { status: "completed", duration: 1800 },
          "validate-schema": { status: "completed", duration: 500 },
          "geocode-batch": { status: "completed", duration: 6200 },
          "create-events": { status: "completed", duration: 3100 },
        },
      },
      results: { totalEvents: 215, created: 215, skipped: 0, geocoded: 210 },
    },
    {
      ingestFile: "museum-exhibits.csv",
      dataset: "Research Study Results",
      stage: "completed",
      progress: {
        overallPercentage: 100,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 400 },
          "detect-schema": { status: "completed", duration: 1100 },
          "validate-schema": { status: "completed", duration: 300 },
          "geocode-batch": { status: "completed", duration: 3200 },
          "create-events": { status: "completed", duration: 1700 },
        },
      },
      results: { totalEvents: 128, created: 128, skipped: 0, geocoded: 124 },
    },
    {
      ingestFile: "broken-economic-data.csv",
      dataset: "GDP Growth Rates",
      stage: "failed",
      progress: {
        overallPercentage: 35,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 600 },
          "detect-schema": { status: "completed", duration: 2200 },
          "validate-schema": { status: "failed", duration: 1800 },
        },
      },
      errors: [
        { row: 15, error: "Invalid date format: '2026/13/45' is not a valid date" },
        { row: 42, error: "Missing required field: 'location' is empty" },
        { row: 78, error: "Duplicate external ID: 'EVT-2026-0042' already exists in dataset" },
        { row: 103, error: "Invalid coordinate: latitude 95.234 is out of range [-90, 90]" },
      ],
    },
    {
      ingestFile: "transit-routes-update.csv",
      dataset: "Air Quality Measurements",
      stage: "needs-review",
      progress: {
        overallPercentage: 45,
        stages: {
          "analyze-duplicates": { status: "completed", duration: 1500 },
          "detect-schema": { status: "completed", duration: 4200 },
          "validate-schema": { status: "needs-review", duration: 2100 },
        },
      },
    },
  ];
};
