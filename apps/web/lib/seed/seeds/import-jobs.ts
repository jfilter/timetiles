/**
 * @module This file contains the seed data for the Import Jobs collection.
 *
 * It defines a set of predefined import job entries that represent individual processing jobs
 * for imported data files. Each job tracks the processing pipeline from detection to completion.
 */
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

// Use Payload type with specific omissions for seed data
export type ImportJobSeed = Omit<ImportJob, "id" | "createdAt" | "updatedAt">;

// Helper function to create import job entry
const createImportJob = (
  stage:
    | "analyze-duplicates"
    | "detect-schema"
    | "validate-schema"
    | "await-approval"
    | "geocode-batch"
    | "create-events"
    | "completed"
    | "failed",
  sheetIndex: number = 0,
  importFileName?: string,
  datasetName?: string
): ImportJobSeed => ({
  stage,
  sheetIndex,
  // These fields will be resolved by the relationship system
  importFile: (importFileName ?? "air_quality_2024_01_15.csv") as unknown as number | ImportFile,
  dataset: datasetName as unknown as number | Dataset,
  progress: {
    current: stage === "completed" ? 100 : Math.floor(Math.random() * 80 + 10),
    total: 100,
    batchNumber: stage === "completed" ? undefined : Math.floor(Math.random() * 5 + 1),
  },
});

export const importJobSeeds = (environment: string): ImportJobSeed[] => {
  const baseImportJobs: ImportJobSeed[] = [
    createImportJob("completed", 0, "air_quality_2024_01_15.csv", "Air Quality Measurements"),
    createImportJob("completed", 0, "economic_indicators_q1_2024.xlsx", "GDP Growth Rates"),
    createImportJob("completed", 0, "research_data_batch_01.csv", "Research Study Results"),
  ];

  if (environment === "development") {
    return [
      ...baseImportJobs,
      createImportJob("completed", 0, "community_events_spring_2024.csv"),
      createImportJob("geocode-batch", 0, "cultural_events_archive.xlsx"),
      createImportJob("failed", 0, "failed_import_example.csv"),
      createImportJob("completed", 0, "large_dataset_import.csv", "Water Quality Assessments"),
      createImportJob("completed", 1, "large_dataset_import.csv", "Climate Station Data"),
      createImportJob("validate-schema", 0, "pending_validation.xlsx"),
      createImportJob("completed", 0, "multi_sheet_research.xlsx", "Research Study Results"),
      createImportJob("completed", 1, "multi_sheet_research.xlsx", "Survey Response Data"),
      createImportJob("completed", 2, "multi_sheet_research.xlsx"),
      createImportJob("completed", 3, "multi_sheet_research.xlsx"),
    ];
  }

  if (environment === "test") {
    return [
      ...baseImportJobs,
      createImportJob("completed", 0, "test_data_small.csv"),
      createImportJob("geocode-batch", 0, "test_data_processing.xlsx"),
      createImportJob("failed", 0, "test_failed_import.csv"),
    ];
  }

  return baseImportJobs;
};
