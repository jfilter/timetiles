import type { Payload } from "payload";
import type { Logger } from "pino";

import { createSingleEvent } from "../utils/event-creation";
import {
  findDatasetForImport,
  TASK_EVENT_CREATION,
  TASK_GEOCODING_BATCH,
  UNKNOWN_ERROR_MESSAGE,
} from "../utils/import-helpers";
import {
  extractEventCreationContext,
  type JobHandlerContext,
  type GeocodingBatchJobPayload,
} from "../utils/job-context";

import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import type { Import, Event, EventsSelect, Dataset } from "@/payload-types";

const processEventBatch = async (
  payload: Payload,
  processedData: Record<string, unknown>[],
  dataset: Dataset,
  importId: Import["id"],
  currentImport: Import,
  logger: Logger,
) => {
  const createdEventIds: number[] = [];
  let failedEventCount = 0;
  let preExistingCoordinateCount = 0;

  for (const eventData of processedData) {
    const result = await createSingleEvent(payload, eventData, dataset, importId, currentImport, logger);

    if (result.success && result.eventId != null) {
      createdEventIds.push(result.eventId);
      if (result.hasPreExistingCoords === true) {
        preExistingCoordinateCount++;
      }
    } else {
      failedEventCount++;
    }
  }

  return {
    createdEventIds,
    failedEventCount,
    preExistingCoordinateCount,
  };
};

const updateImportProgress = async (
  payload: Payload,
  importId: string | number,
  createdEventCount: number,
  processedRowCount: number,
) => {
  const importRecord: Import = await payload.findByID({
    collection: "imports",
    id: importId,
  });

  const currentCreatedEvents = Number(importRecord.progress?.createdEvents) || 0;
  const currentProcessedRows = Number(importRecord.progress?.processedRows) || 0;

  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      progress: {
        ...importRecord.progress,
        createdEvents: currentCreatedEvents + createdEventCount,
        processedRows: currentProcessedRows + processedRowCount,
      },
    },
  });
};

const queueGeocodingIfNeeded = async (
  payload: Payload,
  createdEventIds: number[],
  importId: string | number,
  batchNumber: number,
  logger: Logger,
) => {
  const eventsWithAddresses = await payload.find({
    collection: "events",
    where: {
      and: [
        { id: { in: createdEventIds } },
        { "geocodingInfo.originalAddress": { exists: true } },
        {
          or: [{ "location.latitude": { exists: false } }, { "coordinateSource.type": { equals: "none" } }],
        },
      ],
    },
    select: { id: true } as EventsSelect<true>,
    limit: createdEventIds.length,
  });

  const eventsNeedingGeocoding: number[] = eventsWithAddresses.docs.map((event: Pick<Event, "id">) => event.id);

  if (eventsNeedingGeocoding.length > 0) {
    logger.info("Queueing geocoding batch job", { geocodingEventCount: eventsNeedingGeocoding.length });

    await payload.jobs.queue({
      task: TASK_GEOCODING_BATCH,
      input: {
        importId,
        eventIds: eventsNeedingGeocoding,
        batchNumber,
      } as GeocodingBatchJobPayload["input"],
    });
  } else {
    logger.debug("No events require geocoding in this batch");
  }
};

const updateImportStageIfLastBatch = async (payload: Payload, importId: string | number, logger: Logger) => {
  const updatedImport = await payload.findByID({
    collection: "imports",
    id: importId,
  });

  const totalBatches = Number(updatedImport.batchInfo?.totalBatches) || 0;
  const currentBatch = Number(updatedImport.batchInfo?.currentBatch) || 0;

  // Batch numbering starts from 1, so check if currentBatch equals totalBatches
  logger.debug("Checking if last batch", { currentBatch, totalBatches, isLastBatch: currentBatch === totalBatches });
  if (currentBatch === totalBatches) {
    // Check if any events need geocoding
    const eventsNeedingGeocoding = await payload.find({
      collection: "events",
      where: {
        and: [
          { import: { equals: importId } },
          { "geocodingInfo.originalAddress": { exists: true } },
          {
            or: [{ "location.latitude": { exists: false } }, { "coordinateSource.type": { equals: "none" } }],
          },
        ],
      },
      limit: 1,
    });

    if (eventsNeedingGeocoding.docs.length > 0) {
      logger.debug("Last batch processed, updating import stage to geocoding");
      await payload.update({
        collection: "imports",
        id: importId,
        data: { processingStage: "geocoding" },
      });
    } else {
      logger.info("Last batch processed, no geocoding needed - marking import as completed");
      await payload.update({
        collection: "imports",
        id: importId,
        data: {
          status: "completed",
          processingStage: "completed",
          completedAt: new Date().toISOString(),
        },
      });
    }
  }
};

export const eventCreationJob = {
  slug: TASK_EVENT_CREATION,
  handler: async (context: JobHandlerContext) => {
    const { payload, input } = extractEventCreationContext(context);
    const { importId, processedData, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, TASK_EVENT_CREATION);
    logger.info("Starting event creation job", { importId, batchNumber, eventCount: processedData.length });
    const startTime = Date.now();

    try {
      // Get current import and find dataset
      const currentImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const dataset = await findDatasetForImport(payload, currentImport, logger);

      // Process events
      const { createdEventIds, failedEventCount, preExistingCoordinateCount } = await processEventBatch(
        payload,
        processedData,
        dataset,
        importId,
        currentImport,
        logger,
      );

      logger.info("Event creation completed", {
        createdEvents: createdEventIds.length,
        failedEvents: failedEventCount,
        preExistingCoordinates: preExistingCoordinateCount,
        totalEvents: processedData.length,
      });

      // Update progress
      await updateImportProgress(payload, importId, createdEventIds.length, processedData.length);

      // Queue geocoding if needed
      await queueGeocodingIfNeeded(payload, createdEventIds, importId, batchNumber, logger);

      // Check if this is the last batch and update stage
      await updateImportStageIfLastBatch(payload, importId, logger);

      logPerformance("Event creation job", Date.now() - startTime, {
        importId,
        batchNumber,
        createdEvents: createdEventIds.length,
        failedEvents: failedEventCount,
      });

      return { output: {} };
    } catch (error) {
      logError(error, "Event creation job failed", { importId, batchNumber });

      await payload.update({
        collection: "imports",
        id: importId,
        data: {
          errorCount: 1,
          errorLog: `Event creation batch ${batchNumber} failed: ${error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE}`,
        },
      });

      throw error;
    }
  },
};
