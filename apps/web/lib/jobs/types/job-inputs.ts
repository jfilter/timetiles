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
export interface DatasetDetectionJobInput extends FileJobInput {}

export interface AnalyzeDuplicatesJobInput extends ImportJobInput {}

export interface SchemaDetectionJobInput extends BatchJobInput {}

export interface ValidateSchemaJobInput extends ImportJobInput {}

export interface CreateSchemaVersionJobInput extends ImportJobInput {}

export interface GeocodingBatchJobInput extends BatchJobInput {}

export interface CreateEventsBatchJobInput extends BatchJobInput {}
