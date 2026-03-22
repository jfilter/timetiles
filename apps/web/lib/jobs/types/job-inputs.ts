/**
 * Defines the TypeScript interfaces for the inputs of different jobs in the import pipeline.
 *
 * This file provides standardized type definitions for the `input` property of various
 * import-related jobs. Using these types ensures consistency and type safety when
 * queuing and handling jobs throughout the system.
 *
 * @module
 */

// Base job input interface
export interface BaseJobInput {
  input: unknown;
}

// For jobs that operate on import files (dataset detection)
export interface FileJobInput extends BaseJobInput {
  input: { ingestFileId: string; catalogId?: string };
}

// For jobs that operate on import jobs (most pipeline jobs)
export interface IngestJobInput extends BaseJobInput {
  input: { ingestJobId: string | number };
}

// For jobs that process data in batches
export interface BatchJobInput extends BaseJobInput {
  input: { ingestJobId: string | number; batchNumber: number };
}

// Specific job input types
export type DatasetDetectionJobInput = FileJobInput;

export type AnalyzeDuplicatesJobInput = IngestJobInput;

export type SchemaDetectionJobInput = IngestJobInput;

export type ValidateSchemaJobInput = IngestJobInput;

export type CreateSchemaVersionJobInput = IngestJobInput;

export type GeocodingBatchJobInput = BatchJobInput;

export type CreateEventsBatchJobInput = IngestJobInput;
