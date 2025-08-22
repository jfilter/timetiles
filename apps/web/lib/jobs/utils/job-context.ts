/**
 * Defines types and helper functions for managing the context object passed to job handlers.
 *
 * This module provides a standardized structure (`JobHandlerContext`) for the context
 * object that job handlers receive. It includes TypeScript interfaces for various job
 * payloads and helper functions to safely extract necessary information like the
 * Payload instance and job-specific inputs from the context. This ensures
 * consistency and robustness in how jobs are executed.
 *
 * @module
 */
import type { Payload } from "payload";

import type { ImportJob } from "@/payload-types";

// Enhanced job payload types using current import system
export interface FileParsingJobPayload {
  input: {
    importJobId: ImportJob["id"];
    filePath: string;
    fileType: "csv" | "xlsx";
  };
}

export interface BatchProcessingJobPayload {
  input: {
    importJobId: ImportJob["id"];
    batchNumber: number;
    batchData: Record<string, unknown>[];
  };
}

export interface GeocodingBatchJobPayload {
  input: {
    importJobId: ImportJob["id"];
    eventIds?: number[];
    batchNumber?: number;
  };
}

export interface EventCreationJobPayload {
  input: {
    importJobId: ImportJob["id"];
    processedData: Record<string, unknown>[];
    batchNumber: number;
  };
}

// Job handler context type that works with both Payload types and test mocks
export type JobHandlerContext<T = unknown> = {
  input?: T;
  job?: {
    id: string | number;
    taskStatus?: Record<string, unknown>;
    [key: string]: unknown;
  };
  req?: {
    payload: Payload;
    [key: string]: unknown;
  };
  // Legacy test support - payload directly on context
  payload?: Payload;
  // Support any additional properties for backwards compatibility
  [key: string]: unknown;
};

// Helper function to extract and validate context
export const extractFileParsingContext = (context: JobHandlerContext) => {
  const payload = (context.req?.payload ?? context.payload) as Payload;
  if (payload == null) {
    throw new Error("Payload instance not found in job context");
  }

  const input = context.input as FileParsingJobPayload["input"];
  if (input?.importJobId == null) {
    throw new Error("Import Job ID is required for file parsing job");
  }

  return { payload, input };
};

export const extractEventCreationContext = (context: JobHandlerContext) => {
  const payload = (context.req?.payload ?? context.payload) as Payload;
  if (payload == null) {
    throw new Error("Payload instance not found in job context");
  }

  const input = context.input as EventCreationJobPayload["input"];
  if (input?.importJobId == null) {
    throw new Error("Import Job ID is required for event creation job");
  }

  return { payload, input };
};
