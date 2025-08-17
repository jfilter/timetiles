/**
 * @module This file contains the seed data for the Import Files collection.
 *
 * It defines a set of predefined import file entries that represent files uploaded to the system
 * for data import. This ensures realistic import scenarios are available for development and testing.
 */
import type { Catalog, Dataset, ImportFile } from "@/payload-types";

// Use Payload type with specific omissions for seed data
export type ImportFileSeed = Omit<ImportFile, "id" | "createdAt" | "updatedAt">;

// Helper function to create import file entry
const createImportFile = (
  fileName: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  catalogSlug: string,
  status: "pending" | "parsing" | "processing" | "completed" | "failed" = "completed",
  datasetsCount: number = 1,
  datasetsProcessed: number = 1,
  datasetName?: string
): ImportFileSeed => ({
  filename: fileName,
  originalName,
  mimeType,
  filesize: fileSize,
  status,
  datasetsCount,
  datasetsProcessed,
  // These fields will be resolved by the relationship system
  catalog: catalogSlug as unknown as number | Catalog,
  datasets: datasetName ? [datasetName as unknown as number | Dataset] : [],
  importedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Random date within last week
  completedAt:
    status === "completed" ? new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000).toISOString() : undefined,
  metadata: {
    source: "seed-data",
    environment: "development",
  },
});

export const importFileSeeds = (environment: string): ImportFileSeed[] => {
  const baseImportFiles: ImportFileSeed[] = [
    createImportFile(
      "air_quality_2024_01_15.csv",
      "Air Quality Monitoring - January 2024.csv",
      "text/csv",
      245760, // ~240KB
      "environmental-data",
      "completed",
      1,
      1,
      "Air Quality Measurements"
    ),
    createImportFile(
      "economic_indicators_q1_2024.xlsx",
      "Economic Indicators Q1 2024.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      512000, // ~500KB
      "economic-indicators",
      "completed",
      2,
      2,
      "GDP Growth Rates"
    ),
    createImportFile(
      "research_data_batch_01.csv",
      "Academic Research Dataset - Batch 1.csv",
      "text/csv",
      1048576, // 1MB
      "academic-research-portal",
      "completed",
      1,
      1,
      "Research Study Results"
    ),
  ];

  if (environment === "development") {
    return [
      ...baseImportFiles,
      createImportFile(
        "community_events_spring_2024.csv",
        "Community Events - Spring 2024.csv",
        "text/csv",
        102400, // ~100KB
        "cultural-events",
        "completed",
        1,
        1
      ),
      createImportFile(
        "cultural_events_archive.xlsx",
        "Cultural Heritage Events Archive.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        2097152, // 2MB
        "cultural-events",
        "processing",
        3,
        1
      ),
      createImportFile(
        "failed_import_example.csv",
        "Import Test - Invalid Format.csv",
        "text/csv",
        15360, // ~15KB
        "government-data",
        "failed",
        0,
        0
      ),
      createImportFile(
        "large_dataset_import.csv",
        "Large Environmental Dataset - 2023.csv",
        "text/csv",
        5242880, // 5MB
        "environmental-data",
        "completed",
        2,
        2,
        "Water Quality Assessments"
      ),
      createImportFile(
        "pending_validation.xlsx",
        "Economic Data - Pending Validation.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        716800, // ~700KB
        "economic-indicators",
        "parsing",
        1,
        0
      ),
      createImportFile(
        "multi_sheet_research.xlsx",
        "Multi-Sheet Research Data.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        3145728, // 3MB
        "academic-research-portal",
        "completed",
        4,
        4,
        "Survey Response Data"
      ),
    ];
  }

  if (environment === "test") {
    return [
      ...baseImportFiles,
      createImportFile(
        "test_data_small.csv",
        "Test Dataset - Small.csv",
        "text/csv",
        51200, // ~50KB
        "environmental-data",
        "completed",
        1,
        1
      ),
      createImportFile(
        "test_data_processing.xlsx",
        "Test Dataset - Processing.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        204800, // ~200KB
        "economic-indicators",
        "processing",
        1,
        0
      ),
      createImportFile(
        "test_failed_import.csv",
        "Test Failed Import.csv",
        "text/csv",
        10240, // ~10KB
        "academic-research-portal",
        "failed",
        0,
        0
      ),
    ];
  }

  return baseImportFiles;
};
