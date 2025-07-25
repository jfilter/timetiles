import type { Import } from "@/payload-types";

// Use Payload type with specific modifications for seed data
export type ImportSeed = Omit<
  Import,
  "id" | "createdAt" | "updatedAt" | "catalog" | "user" | "importedAt" | "completedAt"
> & {
  catalog: string; // This will be resolved to catalog ID during seeding
  importedAt?: Date; // Use Date object for easier seed data handling
  completedAt?: Date; // Use Date object for easier seed data handling
};

// Helper function to create import seed data
const createImportSeed = (
  fileName: string,
  originalName: string,
  catalog: string,
  fileSize: number,
  mimeType: string,
  status: "completed" | "failed",
  importedAt: Date,
  completedAt: Date | undefined,
  rowCount: number,
  errorCount: number,
  metadata: Record<string, unknown>,
  errorLog?: string,
): ImportSeed => ({
  fileName,
  originalName,
  catalog,
  fileSize,
  mimeType,
  status,
  importedAt,
  completedAt,
  rowCount,
  errorCount,
  metadata,
  ...(errorLog != null && { errorLog }),
});

// Base import configurations
const getBaseImports = (): ImportSeed[] => [
  createImportSeed(
    "air_quality_2024_01_15.csv",
    "Air Quality Data - January 15, 2024",
    "environmental-data",
    15240,
    "text/csv",
    "completed",
    new Date("2024-01-15T09:00:00Z"),
    new Date("2024-01-15T09:05:00Z"),
    2,
    0,
    {
      source: "Environmental Agency API",
      import_type: "scheduled",
      columns: ["station_id", "timestamp", "pm25", "pm10", "o3", "no2", "location"],
    },
  ),
  createImportSeed(
    "gdp_q4_2023.json",
    "GDP Data Q4 2023",
    "economic-indicators",
    8920,
    "application/json",
    "completed",
    new Date("2024-01-01T10:00:00Z"),
    new Date("2024-01-01T10:02:00Z"),
    2,
    0,
    {
      source: "World Bank API",
      import_type: "manual",
      data_period: "Q4 2023",
    },
  ),
];

// Development-only import configurations - split into smaller functions
const createSocialMediaImport = (): ImportSeed =>
  createImportSeed(
    "social_media_20240115.xlsx",
    "Social Media Engagement - January 15, 2024",
    "community-events-portal",
    45600,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "completed",
    new Date("2024-01-16T08:00:00Z"),
    new Date("2024-01-16T08:03:00Z"),
    2,
    0,
    {
      source: "Social Media Analytics Platform",
      import_type: "scheduled",
      platforms: ["twitter", "facebook"],
    },
  );

const createHistoricalWeatherImport = (): ImportSeed =>
  createImportSeed(
    "weather_historical_2020.csv",
    "Historical Weather Data 2020",
    "historical-records",
    125000,
    "text/csv",
    "completed",
    new Date("2020-12-31T23:30:00Z"),
    new Date("2020-12-31T23:45:00Z"),
    1,
    0,
    {
      source: "Weather Station Archive",
      import_type: "bulk_historical",
      data_period: "2020",
    },
  );

const createFailedImport = (): ImportSeed =>
  createImportSeed(
    "failed_import.csv",
    "Failed Import Example",
    "environmental-data",
    2048,
    "text/csv",
    "failed",
    new Date("2024-01-10T14:00:00Z"),
    undefined,
    0,
    100,
    {
      source: "manual_upload",
      import_type: "manual",
      failure_reason: "Invalid file format",
    },
    "File format validation failed: Invalid CSV structure",
  );

const getDevelopmentImports = (): ImportSeed[] => [
  createSocialMediaImport(),
  createHistoricalWeatherImport(),
  createFailedImport(),
];

export const importSeeds = (environment: string): ImportSeed[] => {
  const baseImports = getBaseImports();

  return environment === "development" ? [...baseImports, ...getDevelopmentImports()] : baseImports;
};
