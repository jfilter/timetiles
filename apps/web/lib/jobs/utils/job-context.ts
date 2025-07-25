import type { Payload } from "payload";

import type {
  Import,
  TaskFileParsing,
  TaskBatchProcessing,
  TaskEventCreation,
  TaskGeocodingBatch,
} from "@/payload-types";

// Enhanced job payload types using Payload task types
export interface FileParsingJobPayload extends TaskFileParsing {
  input: {
    importId: Import["id"];
    filePath: string;
    fileType: "csv" | "xlsx";
  };
}

export interface BatchProcessingJobPayload extends TaskBatchProcessing {
  input: {
    importId: Import["id"];
    batchNumber: number;
    batchData: Record<string, unknown>[];
  };
}

export interface GeocodingBatchJobPayload extends TaskGeocodingBatch {
  input: {
    importId: Import["id"];
    eventIds: number[];
    batchNumber: number;
  };
}

export interface EventCreationJobPayload extends TaskEventCreation {
  input: {
    importId: Import["id"];
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
  if (input?.importId == null) {
    throw new Error("Import ID is required for file parsing job");
  }

  return { payload, input };
};

export const extractEventCreationContext = (context: JobHandlerContext) => {
  const payload = (context.req?.payload ?? context.payload) as Payload;
  if (payload == null) {
    throw new Error("Payload instance not found in job context");
  }

  const input = context.input as EventCreationJobPayload["input"];
  if (input?.importId == null) {
    throw new Error("Import ID is required for event creation job");
  }

  return { payload, input };
};
