import type { Payload } from "payload";
import type { Logger } from "pino";

import { TASK_GEOCODING_BATCH } from "../utils/import-helpers";
import { type JobHandlerContext, type GeocodingBatchJobPayload } from "../utils/job-context";

import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { GeocodingService } from "@/lib/services/geocoding/geocoding-service";
import type { Event } from "@/payload-types";

interface GeocodingResult {
  latitude: number;
  longitude: number;
  provider: string;
  confidence?: number | null;
  normalizedAddress?: string;
  fromCache?: boolean;
}

const updateEventWithGeocodingResult = async (
  payload: Payload,
  eventId: number,
  event: Event,
  geocodingResult: GeocodingResult,
  logger: Logger,
) => {
  logger.debug("Geocoding successful", {
    eventId,
    provider: geocodingResult.provider,
    confidence: geocodingResult.confidence,
    fromCache: geocodingResult.fromCache,
  });

  await payload.update({
    collection: "events",
    id: eventId,
    data: {
      location: {
        latitude: geocodingResult.latitude,
        longitude: geocodingResult.longitude,
      },
      coordinateSource: {
        type: "geocoded",
        confidence: geocodingResult.confidence ?? 0.8,
        validationStatus: "valid",
      },
      geocodingInfo: {
        ...event.geocodingInfo,
        provider: geocodingResult.provider as "google" | "nominatim" | "manual" | null,
        confidence: geocodingResult.confidence,
        normalizedAddress: geocodingResult.normalizedAddress,
      },
    },
  });
};

const updateEventWithFailedGeocoding = async (payload: Payload, eventId: number, logger: Logger) => {
  logger.warn("Geocoding failed - no result", { eventId });

  await payload.update({
    collection: "events",
    id: eventId,
    data: {
      coordinateSource: {
        type: "none",
        confidence: 0.0,
        validationStatus: "invalid",
      },
    },
  });
};

const processEventGeocoding = async (
  payload: Payload,
  eventId: number,
  geocodingService: GeocodingService,
  logger: Logger,
): Promise<{ success: boolean }> => {
  try {
    const event = await payload.findByID({
      collection: "events",
      id: eventId,
    });

    if (event.geocodingInfo?.originalAddress == null || event.geocodingInfo?.originalAddress === "") {
      logger.debug("Event has no address to geocode", { eventId });
      return { success: false };
    }

    logger.debug("Geocoding event address", {
      eventId,
      address: event.geocodingInfo.originalAddress,
    });

    const geocodingResult = await geocodingService.geocode(event.geocodingInfo.originalAddress);

    if (geocodingResult != null && geocodingResult != undefined) {
      await updateEventWithGeocodingResult(payload, eventId, event, geocodingResult, logger);
      return { success: true };
    } else {
      await updateEventWithFailedGeocoding(payload, eventId, logger);
      return { success: false };
    }
  } catch (eventError) {
    logError(eventError, "Failed to geocode individual event", { eventId });
    return { success: false };
  }
};

const updateGeocodingStats = async (
  payload: Payload,
  importId: string | number,
  geocodedCount: number,
  processedCount: number,
) => {
  const currentImport = await payload.findByID({
    collection: "imports",
    id: importId,
  });

  const currentGeocoded = Number(currentImport.progress?.geocodedRows ?? 0);

  await payload.update({
    collection: "imports",
    id: importId,
    data: {
      progress: {
        ...currentImport.progress,
        geocodedRows: currentGeocoded + geocodedCount,
      },
      geocodingStats: {
        ...currentImport.geocodingStats,
        totalAddresses: (currentImport.geocodingStats?.totalAddresses ?? 0) + processedCount,
        successfulGeocodes: (currentImport.geocodingStats?.successfulGeocodes ?? 0) + geocodedCount,
        failedGeocodes: (currentImport.geocodingStats?.failedGeocodes ?? 0) + (processedCount - geocodedCount),
      },
    },
  });
};

const checkAndCompleteImportIfAllGeocodingDone = async (
  payload: Payload,
  importId: string | number,
  logger: Logger,
) => {
  // Check if there are any more events that need geocoding
  // An event needs geocoding if it has an originalAddress but hasn't been processed yet:
  // - No location AND no coordinateSource.validationStatus (hasn't been attempted)
  const eventsNeedingGeocoding = await payload.find({
    collection: "events",
    where: {
      and: [
        { import: { equals: importId } },
        { "geocodingInfo.originalAddress": { exists: true } },
        { "location.latitude": { exists: false } },
        { "coordinateSource.validationStatus": { exists: false } },
      ],
    },
    limit: 1,
  });

  if (eventsNeedingGeocoding.docs.length === 0) {
    logger.info("All geocoding completed - marking import as completed");
    await payload.update({
      collection: "imports",
      id: importId,
      data: {
        status: "completed",
        processingStage: "completed",
        completedAt: new Date().toISOString(),
      },
    });
  } else {
    logger.debug("Geocoding still in progress", { remainingEvents: eventsNeedingGeocoding.docs.length });
  }
};

const processBatchEvents = async (
  payload: Payload,
  eventIds: number[],
  geocodingService: GeocodingService,
  logger: ReturnType<typeof createJobLogger>,
): Promise<{ geocodedCount: number; processedCount: number }> => {
  let geocodedCount = 0;
  let processedCount = 0;

  for (const eventId of eventIds) {
    const result = await processEventGeocoding(payload, eventId, geocodingService, logger);

    if (result.success) {
      geocodedCount++;
    }
    processedCount++;
  }

  return { geocodedCount, processedCount };
};

const logBatchCompletion = (
  logger: ReturnType<typeof createJobLogger>,
  importId: number,
  batchNumber: number,
  geocodedCount: number,
  processedCount: number,
  eventIds: number[],
  startTime: number,
): void => {
  logger.info("Geocoding batch completed", {
    importId,
    batchNumber,
    geocodedCount,
    processedCount,
    totalEvents: eventIds.length,
  });

  logPerformance("Geocoding batch job", Date.now() - startTime, {
    importId,
    batchNumber,
    geocodedEvents: geocodedCount,
    processedEvents: processedCount,
  });
};

export const geocodingBatchJob = {
  slug: TASK_GEOCODING_BATCH,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    if (payload == null) {
      throw new Error("Payload instance not found in job context");
    }

    const input = (context.input ?? context.job?.input) as GeocodingBatchJobPayload["input"];
    const { importId, eventIds, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocoding-batch");
    logger.info("Starting geocoding batch job", { importId, batchNumber, eventCount: eventIds.length });
    const startTime = Date.now();

    try {
      const geocodingService = new GeocodingService(payload);
      const { geocodedCount, processedCount } = await processBatchEvents(payload, eventIds, geocodingService, logger);

      await updateGeocodingStats(payload, importId, geocodedCount, processedCount);
      await checkAndCompleteImportIfAllGeocodingDone(payload, importId, logger);

      logBatchCompletion(logger, importId, batchNumber, geocodedCount, processedCount, eventIds, startTime);

      return { output: {} };
    } catch (error) {
      logError(error, "Geocoding batch job failed", { importId, batchNumber });

      await payload.update({
        collection: "imports",
        id: importId,
        data: {
          errorCount: 1,
          errorLog: `Geocoding batch ${batchNumber} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });

      throw error;
    }
  },
};
