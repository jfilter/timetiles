import fs from "fs";
import type { Payload } from "payload";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";

import { parseFileByType } from "../utils/data-parsing";
import { validateRequiredFields } from "../utils/data-validation";
import { createAndQueueBatches, detectCoordinateColumns, updateImportStatus } from "../utils/import-helpers";
import { extractFileParsingContext, type JobHandlerContext } from "../utils/job-context";

// Parse and validate file data
const parseAndValidateFile = (
  filePath: string,
  fileType: "csv" | "xlsx",
  logger: ReturnType<typeof createJobLogger>,
) => {
  logger.debug(`Parsing ${fileType} file`);
  const parsedData = parseFileByType(filePath, fileType, logger);
  const { isValid, errors } = validateRequiredFields(parsedData, logger);

  if (!isValid) {
    throw new Error(`File validation failed: ${errors.join(", ")}`);
  }

  return parsedData;
};

// Update import with progress and coordinate detection results
const updateImportProgress = async (
  payload: Payload,
  importId: number,
  parsedData: Record<string, unknown>[],
  coordinateDetectionData: Record<string, unknown>,
) => {
  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      rowCount: parsedData.length,
      progress: {
        totalRows: parsedData.length,
        processedRows: 0,
        geocodedRows: 0,
        createdEvents: 0,
        percentage: 0,
      },
      processingStage: "row-processing",
      ...coordinateDetectionData,
    },
  });
};

// Clean up uploaded file
const cleanupFile = (filePath: string, logger: ReturnType<typeof createJobLogger>) => {
  try {
    fs.unlinkSync(filePath);
    logger.debug("Uploaded file deleted successfully", { filePath });
  } catch (error) {
    logger.warn("Failed to delete uploaded file", { error, filePath });
  }
};

// Handle job failure by updating import status
const handleJobFailure = async (payload: Payload, importId: number, error: unknown) => {
  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      status: "failed",
      errorCount: 1,
      errorLog: error instanceof Error ? error.message : "File parsing failed",
      completedAt: new Date().toISOString(),
    },
  });
};

export const fileParsingJob = {
  slug: JOB_TYPES.FILE_PARSING,
  handler: async (context: JobHandlerContext) => {
    const { payload, input } = extractFileParsingContext(context);
    const { importId, filePath, fileType } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, JOB_TYPES.FILE_PARSING);
    logger.info("Starting file parsing job", { importId, filePath, fileType });
    const startTime = Date.now();

    try {
      // Update import status
      await updateImportStatus(
        payload,
        importId,
        {
          status: "processing",
          processingStage: "file-parsing",
        },
        logger,
      );

      // Parse and validate the file
      const parsedData = parseAndValidateFile(filePath, fileType, logger);
      const coordinateDetectionData = detectCoordinateColumns(parsedData, logger);

      // Update progress and coordinate detection results
      await updateImportProgress(payload, importId, parsedData, coordinateDetectionData);

      // Create batches and queue batch processing jobs
      await createAndQueueBatches(payload, importId, parsedData, 100, logger);

      // Clean up uploaded file
      cleanupFile(filePath, logger);

      logPerformance("File parsing job", Date.now() - startTime, {
        importId,
        totalRows: parsedData.length,
      });

      return { output: {} };
    } catch (error) {
      logError(error, "File parsing job failed", { importId, filePath });
      await handleJobFailure(payload, importId, error);
      throw error;
    }
  },
};
