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
const createImportSeed = (params: {
  fileName: string;
  originalName: string;
  catalog: string;
  fileSize: number;
  mimeType: string;
  status: "completed" | "failed";
  importedAt: Date;
  completedAt: Date | undefined;
  rowCount: number;
  errorCount: number;
  metadata: Record<string, unknown>;
  errorLog?: string;
}): ImportSeed => {
  const {
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
    errorLog,
  } = params;
  return {
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
  };
};

// Base import configurations
const getBaseImports = (): ImportSeed[] => [
  createImportSeed({
    fileName: "air_quality_2024_01_15.csv",
    originalName: "Air Quality Data - January 15, 2024",
    catalog: "environmental-data",
    fileSize: 15240,
    mimeType: "text/csv",
    status: "completed",
    importedAt: new Date("2024-01-15T09:00:00Z"),
    completedAt: new Date("2024-01-15T09:05:00Z"),
    rowCount: 2,
    errorCount: 0,
    metadata: {
      source: "Environmental Agency API",
      import_type: "scheduled",
      columns: ["station_id", "timestamp", "pm25", "pm10", "o3", "no2", "location"],
    },
  }),
  createImportSeed({
    fileName: "gdp_q4_2023.json",
    originalName: "GDP Data Q4 2023",
    catalog: "economic-indicators",
    fileSize: 8920,
    mimeType: "application/json",
    status: "completed",
    importedAt: new Date("2024-01-01T10:00:00Z"),
    completedAt: new Date("2024-01-01T10:02:00Z"),
    rowCount: 2,
    errorCount: 0,
    metadata: {
      source: "World Bank API",
      import_type: "manual",
      data_period: "Q4 2023",
    },
  }),
];

// Development-only import configurations - split into smaller functions
const createSocialMediaImport = (): ImportSeed =>
  createImportSeed({
    fileName: "social_media_20240115.xlsx",
    originalName: "Social Media Engagement - January 15, 2024",
    catalog: "community-events-portal",
    fileSize: 45600,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "completed",
    importedAt: new Date("2024-01-16T08:00:00Z"),
    completedAt: new Date("2024-01-16T08:03:00Z"),
    rowCount: 2,
    errorCount: 0,
    metadata: {
      source: "Social Media Analytics Platform",
      import_type: "scheduled",
      platforms: ["twitter", "facebook"],
    },
  });

const createHistoricalWeatherImport = (): ImportSeed =>
  createImportSeed({
    fileName: "weather_historical_2020.csv",
    originalName: "Historical Weather Data 2020",
    catalog: "historical-records",
    fileSize: 125000,
    mimeType: "text/csv",
    status: "completed",
    importedAt: new Date("2020-12-31T23:30:00Z"),
    completedAt: new Date("2020-12-31T23:45:00Z"),
    rowCount: 1,
    errorCount: 0,
    metadata: {
      source: "Weather Station Archive",
      import_type: "bulk_historical",
      data_period: "2020",
    },
  });

const createFailedImport = (): ImportSeed =>
  createImportSeed({
    fileName: "failed_import.csv",
    originalName: "Failed Import Example",
    catalog: "environmental-data",
    fileSize: 2048,
    mimeType: "text/csv",
    status: "failed",
    importedAt: new Date("2024-01-10T14:00:00Z"),
    completedAt: undefined,
    rowCount: 0,
    errorCount: 100,
    metadata: {
      source: "manual_upload",
      import_type: "manual",
      failure_reason: "Invalid file format",
    },
    errorLog: "File format validation failed: Invalid CSV structure",
  });

const getDevelopmentImports = (): ImportSeed[] => [
  createSocialMediaImport(),
  createHistoricalWeatherImport(),
  createFailedImport(),
];

export const importSeeds = (environment: string): ImportSeed[] => {
  const baseImports = getBaseImports();

  return environment === "development" ? [...baseImports, ...getDevelopmentImports()] : baseImports;
};
