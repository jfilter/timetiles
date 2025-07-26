import type { Payload } from "payload";

import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { CoordinateValidator } from "@/lib/services/import/coordinate-validator";

import { processRowData } from "../utils/event-processing";
import { BATCH_PROCESSING_TASK, TASK_EVENT_CREATION } from "../utils/import-helpers";
import type { BatchProcessingJobPayload, JobHandlerContext } from "../utils/job-context";

const updateBatchProgress = async (payload: Payload, importId: string | number, batchNumber: number) => {
  const currentImport = await payload.findByID({
    collection: "imports",
    id: importId,
  });

  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      batchInfo: {
        ...currentImport.batchInfo,
        currentBatch: batchNumber,
      },
    },
  });

  return currentImport;
};

const processDataBatch = (
  batchData: Record<string, unknown>[],
  hasCoordinates: boolean,
  columnMapping: Record<string, unknown> | undefined,
  coordinateValidator: CoordinateValidator,
) => {
  return batchData.map((row) => {
    return processRowData(row, hasCoordinates, columnMapping, coordinateValidator);
  });
};

const handleBatchError = async (payload: Payload, error: unknown, importId: string | number, batchNumber: number) => {
  logError(error, "Batch processing job failed", { importId, batchNumber });

  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      status: "failed",
      errorCount: 1,
      errorLog: error instanceof Error ? error.message : "Batch processing failed",
    },
  });

  throw error;
};

export const batchProcessingJob = {
  slug: BATCH_PROCESSING_TASK,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as BatchProcessingJobPayload["input"];
    const { importId, batchNumber, batchData } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, BATCH_PROCESSING_TASK);
    logger.info("Starting batch processing job", { importId, batchNumber, itemCount: batchData.length });
    const startTime = Date.now();

    try {
      // Update current batch and get import data
      const currentImport = await updateBatchProgress(payload, importId, batchNumber);

      logger.debug("Processing batch data");

      // Initialize coordinate validator and process data
      const coordinateValidator = new CoordinateValidator();
      const hasCoordinates = currentImport.coordinateDetection?.detected === true;
      const columnMapping = currentImport.coordinateDetection?.columnMapping;

      const processedData = processDataBatch(batchData, hasCoordinates, columnMapping, coordinateValidator);

      // Queue event creation job
      logger.info("Queueing event creation job", { processedItemCount: processedData.length });

      await payload.jobs.queue({
        task: TASK_EVENT_CREATION,
        input: {
          importId,
          processedData,
          batchNumber,
        },
      });

      logPerformance("Batch processing job", Date.now() - startTime, {
        importId,
        batchNumber,
        processedItems: processedData.length,
      });

      return { output: {} };
    } catch (error) {
      return handleBatchError(payload, error, importId, batchNumber);
    }
  },
};
