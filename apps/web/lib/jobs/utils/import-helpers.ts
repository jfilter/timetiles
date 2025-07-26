import type { Payload } from "payload";

import type { createJobLogger } from "@/lib/logger";
import { logError } from "@/lib/logger";
import { GeoLocationDetector } from "@/lib/services/import/geo-location-detector";
import type { Dataset, Import } from "@/payload-types";

// Constants to reduce string duplication
export const BATCH_PROCESSING_TASK = "batch-processing";
export const TASK_EVENT_CREATION = "event-creation";
export const TASK_GEOCODING_BATCH = "geocoding-batch";
export const ERROR_PROCESSING_MESSAGE = "processing failed";
export const UNKNOWN_ERROR_MESSAGE = "Unknown error";

export const updateImportStatus = async (
  payload: Payload,
  importId: Import["id"],
  updates: Partial<Import>,
  logger: ReturnType<typeof createJobLogger>,
): Promise<void> => {
  try {
    await payload.update({
      collection: "imports",
      id: importId,
      data: updates,
    });
    logger.info("Import status updated", { importId, updates });
  } catch (error) {
    logError(error, "Failed to update import status", { importId, updates });
    throw error;
  }
};

export const detectCoordinateColumns = (
  parsedData: Record<string, unknown>[],
  logger: ReturnType<typeof createJobLogger>,
) => {
  logger.info("Starting coordinate detection");

  const detector = new GeoLocationDetector();
  const headers = Object.keys(parsedData[0] ?? {});
  const detectionResult = detector.detectGeoColumns(headers, parsedData);

  logger.info("Coordinate detection completed", {
    found: detectionResult.found,
    method: detectionResult.detectionMethod,
    confidence: detectionResult.confidence,
  });

  return {
    coordinateDetection: {
      detected: detectionResult.found,
      detectionMethod: detectionResult.detectionMethod,
      columnMapping: detectionResult,
      detectionConfidence: detectionResult.confidence,
      sampleValidation: undefined,
    },
  };
};

export const createAndQueueBatches = async (
  payload: Payload,
  importId: Import["id"],
  parsedData: Record<string, unknown>[],
  batchSize: number,
  logger: ReturnType<typeof createJobLogger>,
): Promise<void> => {
  const totalBatches = Math.ceil(parsedData.length / batchSize);

  logger.info("Creating batches for processing", {
    totalRows: parsedData.length,
    batchSize,
    totalBatches,
  });

  // Update import with batch info
  await updateImportStatus(
    payload,
    importId,
    {
      batchInfo: {
        batchSize,
        currentBatch: 0,
        totalBatches,
      },
      progress: {
        totalRows: parsedData.length,
        processedRows: 0,
        geocodedRows: 0,
        createdEvents: 0,
        percentage: 0,
      },
    },
    logger,
  );

  // Queue batch processing jobs
  for (let i = 0; i < totalBatches; i++) {
    const startIndex = i * batchSize;
    const endIndex = Math.min(startIndex + batchSize, parsedData.length);
    const batchData = parsedData.slice(startIndex, endIndex);

    await payload.jobs.queue({
      task: BATCH_PROCESSING_TASK,
      input: {
        importId,
        batchNumber: i + 1,
        batchData,
      },
    });
  }

  logger.info("All batch jobs queued successfully", { totalBatches });
};

export const findDatasetForImport = async (
  payload: Payload,
  importRecord: Import,
  logger: ReturnType<typeof createJobLogger>,
): Promise<Dataset> => {
  try {
    const catalogId = typeof importRecord.catalog === "object" ? importRecord.catalog.id : importRecord.catalog;

    logger.info("Finding dataset for catalog", { catalogId });

    const datasets = await payload.find({
      collection: "datasets",
      where: {
        catalog: {
          equals: catalogId,
        },
      },
      limit: 1,
    });

    if (datasets.docs.length === 0) {
      throw new Error(`No dataset found for catalog ID: ${catalogId}`);
    }

    const dataset = datasets.docs[0] as Dataset;
    logger.info("Dataset found", { datasetId: dataset.id, name: dataset.name });

    return dataset;
  } catch (error) {
    logError(error, "Failed to find dataset for import", {
      importId: importRecord.id,
      catalog: importRecord.catalog,
    });
    throw error;
  }
};
