/**
 * @module Defines the TypeScript interfaces for the inputs of different jobs in the import pipeline.
 *
 * This file provides standardized type definitions for the `input` property of various
 * import-related jobs. Using these types ensures consistency and type safety when
 * queuing and handling jobs throughout the system.
 */

// Base job input interface
export interface BaseJobInput {
  input: unknown;
}

// For jobs that operate on import files (dataset detection)
export interface FileJobInput extends BaseJobInput {
  input: {
    importFileId: string;
    catalogId?: string;
  };
}

// For jobs that operate on import jobs (most pipeline jobs)
export interface ImportJobInput extends BaseJobInput {
  input: {
    importJobId: string | number;
  };
}

// For jobs that process data in batches
export interface BatchJobInput extends BaseJobInput {
  input: {
    importJobId: string | number;
    batchNumber: number;
  };
}

// Specific job input types
export type DatasetDetectionJobInput = FileJobInput;

export type AnalyzeDuplicatesJobInput = ImportJobInput;

export type SchemaDetectionJobInput = BatchJobInput;

export type ValidateSchemaJobInput = ImportJobInput;

export type CreateSchemaVersionJobInput = ImportJobInput;

export type GeocodingBatchJobInput = BatchJobInput;

export type CreateEventsBatchJobInput = BatchJobInput;
