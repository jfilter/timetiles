/**
 * @module This file contains the seed data for the Import Files collection.
 *
 * It defines a set of predefined import file entries that represent files uploaded to the system
 * for data import. This ensures realistic import scenarios are available for development and testing.
 */
import type { Catalog, Dataset, ImportFile } from "@/payload-types";

// Use Payload type with specific omissions for seed data
export type ImportFileSeed = Omit<ImportFile, "id" | "createdAt" | "updatedAt">;

// Constants
const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface ImportFileOptions {
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  catalogSlug: string;
  status?: "pending" | "parsing" | "processing" | "completed" | "failed";
  datasetsCount?: number;
  datasetsProcessed?: number;
  datasetName?: string;
}

// Helper function to create import file entry
const createImportFile = (options: ImportFileOptions): ImportFileSeed => ({
  filename: options.fileName,
  originalName: options.originalName,
  mimeType: options.mimeType,
  filesize: options.fileSize,
  status: options.status ?? "completed",
  datasetsCount: options.datasetsCount ?? 1,
  datasetsProcessed: options.datasetsProcessed ?? 1,
  // These fields will be resolved by the relationship system
  catalog: options.catalogSlug as unknown as number | Catalog,
  datasets: options.datasetName ? [options.datasetName as unknown as number | Dataset] : [],
  // eslint-disable-next-line sonarjs/pseudo-random -- Seeding doesn't need crypto-secure random
  importedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Random date within last week
  completedAt:
    options.status === "completed"
      ? // eslint-disable-next-line sonarjs/pseudo-random -- Seeding doesn't need crypto-secure random
        new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  metadata: {
    source: "seed-data",
    environment: "development",
  },
});

const getBaseImportFiles = (): ImportFileSeed[] => [
  createImportFile({
    fileName: "air_quality_2024_01_15.csv",
    originalName: "Air Quality Monitoring - January 2024.csv",
    mimeType: "text/csv",
    fileSize: 245760, // ~240KB
    catalogSlug: "environmental-data",
    status: "completed",
    datasetsCount: 1,
    datasetsProcessed: 1,
    datasetName: "Air Quality Measurements",
  }),
  createImportFile({
    fileName: "economic_indicators_q1_2024.xlsx",
    originalName: "Economic Indicators Q1 2024.xlsx",
    mimeType: EXCEL_MIME_TYPE,
    fileSize: 512000, // ~500KB
    catalogSlug: "economic-indicators",
    status: "completed",
    datasetsCount: 2,
    datasetsProcessed: 2,
    datasetName: "GDP Growth Rates",
  }),
  createImportFile({
    fileName: "research_data_batch_01.csv",
    originalName: "Academic Research Dataset - Batch 1.csv",
    mimeType: "text/csv",
    fileSize: 1048576, // 1MB
    catalogSlug: "academic-research-portal",
    status: "completed",
    datasetsCount: 1,
    datasetsProcessed: 1,
    datasetName: "Research Study Results",
  }),
];

const getDevelopmentImportFiles = (): ImportFileSeed[] => [
  createImportFile({
    fileName: "community_events_spring_2024.csv",
    originalName: "Community Events - Spring 2024.csv",
    mimeType: "text/csv",
    fileSize: 102400, // ~100KB
    catalogSlug: "cultural-events",
    status: "completed",
    datasetsCount: 1,
    datasetsProcessed: 1,
  }),
  createImportFile({
    fileName: "cultural_events_archive.xlsx",
    originalName: "Cultural Heritage Events Archive.xlsx",
    mimeType: EXCEL_MIME_TYPE,
    fileSize: 2097152, // 2MB
    catalogSlug: "cultural-events",
    status: "processing",
    datasetsCount: 3,
    datasetsProcessed: 1,
  }),
  createImportFile({
    fileName: "failed_import_example.csv",
    originalName: "Import Test - Invalid Format.csv",
    mimeType: "text/csv",
    fileSize: 15360, // ~15KB
    catalogSlug: "government-data",
    status: "failed",
    datasetsCount: 0,
    datasetsProcessed: 0,
  }),
  createImportFile({
    fileName: "large_dataset_import.csv",
    originalName: "Large Environmental Dataset - 2023.csv",
    mimeType: "text/csv",
    fileSize: 5242880, // 5MB
    catalogSlug: "environmental-data",
    status: "completed",
    datasetsCount: 2,
    datasetsProcessed: 2,
    datasetName: "Water Quality Assessments",
  }),
  createImportFile({
    fileName: "pending_validation.xlsx",
    originalName: "Economic Data - Pending Validation.xlsx",
    mimeType: EXCEL_MIME_TYPE,
    fileSize: 716800, // ~700KB
    catalogSlug: "economic-indicators",
    status: "parsing",
    datasetsCount: 1,
    datasetsProcessed: 0,
  }),
  createImportFile({
    fileName: "multi_sheet_research.xlsx",
    originalName: "Multi-Sheet Research Data.xlsx",
    mimeType: EXCEL_MIME_TYPE,
    fileSize: 3145728, // 3MB
    catalogSlug: "academic-research-portal",
    status: "completed",
    datasetsCount: 4,
    datasetsProcessed: 4,
    datasetName: "Survey Response Data",
  }),
];

const getTestImportFiles = (): ImportFileSeed[] => [
  createImportFile({
    fileName: "test_data_small.csv",
    originalName: "Test Dataset - Small.csv",
    mimeType: "text/csv",
    fileSize: 51200, // ~50KB
    catalogSlug: "environmental-data",
    status: "completed",
    datasetsCount: 1,
    datasetsProcessed: 1,
  }),
  createImportFile({
    fileName: "test_data_processing.xlsx",
    originalName: "Test Dataset - Processing.xlsx",
    mimeType: EXCEL_MIME_TYPE,
    fileSize: 204800, // ~200KB
    catalogSlug: "economic-indicators",
    status: "processing",
    datasetsCount: 1,
    datasetsProcessed: 0,
  }),
  createImportFile({
    fileName: "test_failed_import.csv",
    originalName: "Test Failed Import.csv",
    mimeType: "text/csv",
    fileSize: 10240, // ~10KB
    catalogSlug: "academic-research-portal",
    status: "failed",
    datasetsCount: 0,
    datasetsProcessed: 0,
  }),
];

export const importFileSeeds = (environment: string): ImportFileSeed[] => {
  const baseImportFiles = getBaseImportFiles();

  if (environment === "development") {
    return [...baseImportFiles, ...getDevelopmentImportFiles()];
  }

  if (environment === "test") {
    return [...baseImportFiles, ...getTestImportFiles()];
  }

  return baseImportFiles;
};
