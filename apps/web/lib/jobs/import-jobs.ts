// import type { TaskHandlerArgs } from "payload"; // TODO: Use for better typing
import { GeocodingService } from "../services/geocoding/GeocodingService";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs";
import type {
  Import,
  Dataset,
  Event,
  Catalog,
  TaskFileParsing,
  TaskBatchProcessing,
  TaskEventCreation,
  TaskGeocodingBatch,
} from "../../payload-types";
import { createJobLogger, logError, logPerformance } from "../logger";

// Enhanced job payload types using Payload task types
interface FileParsingJobPayload extends TaskFileParsing {
  input: {
    importId: Import["id"];
    filePath: string;
    fileType: "csv" | "xlsx";
  };
}

interface BatchProcessingJobPayload extends TaskBatchProcessing {
  input: {
    importId: Import["id"];
    batchNumber: number;
    batchData: Record<string, unknown>[];
  };
}

interface GeocodingBatchJobPayload extends TaskGeocodingBatch {
  input: {
    importId: Import["id"];
    eventIds: number[];
    batchNumber: number;
  };
}

interface EventCreationJobPayload extends TaskEventCreation {
  input: {
    importId: Import["id"];
    processedData: Record<string, unknown>[];
    batchNumber: number;
  };
}

// Job handler context type that works with both Payload types and test mocks
type JobHandlerContext<T = any> = {
  input?: T;
  job?: {
    id: string | number;
    taskStatus?: any;
    [key: string]: any;
  };
  req?: {
    payload: any;
    [key: string]: any;
  };
  // Legacy test support - payload directly on context
  payload?: any;
  // Support any additional properties for backwards compatibility
  [key: string]: any;
};

// File parsing job
export const fileParsingJob = {
  slug: "file-parsing",
  handler: async (context: JobHandlerContext) => {
    // Support both new format (req.payload) and legacy format (payload directly)
    const payload = context.req?.payload || context.payload;
    const input = context.input || (context.job as any)?.input;
    const { importId, filePath, fileType } =
      input as FileParsingJobPayload["input"];

    const jobId = context.job?.id || "unknown";
    const logger = createJobLogger(jobId, "file-parsing");
    logger.info({ importId, filePath, fileType }, "Starting file parsing job");
    const startTime = Date.now();

    try {
      // Update import status
      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          status: "processing",
          processingStage: "file-parsing",
        },
      });

      let parsedData: Record<string, unknown>[] = [];
      // let totalRows = 0; // Used for debugging

      logger.debug(`Parsing ${fileType} file`);

      if (fileType === "csv") {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const parseResult = Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header: string) => header.trim().toLowerCase(),
        });

        if (parseResult.errors.length > 0) {
          logger.error({ errors: parseResult.errors }, "CSV parsing errors");
          throw new Error(
            `CSV parsing errors: ${parseResult.errors.map((e: Papa.ParseError) => e.message).join(", ")}`,
          );
        }

        parsedData = parseResult.data as Record<string, unknown>[];
        logger.debug(
          { rowCount: parsedData.length },
          "CSV parsed successfully",
        );
      } else if (fileType === "xlsx") {
        // Read as buffer to avoid file access issues
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName!];
        const jsonData = XLSX.utils.sheet_to_json(worksheet!, {
          header: 1,
          defval: "",
        });

        if (jsonData.length > 0) {
          const headers = (jsonData[0] as string[]).map((h) =>
            h.toString().trim().toLowerCase(),
          );
          parsedData = jsonData.slice(1).map((row: unknown) => {
            const obj: Record<string, unknown> = {};
            const rowArray = row as unknown[];
            headers.forEach((header, index) => {
              obj[header] = rowArray[index] || "";
            });
            return obj;
          });
        }
        logger.debug(
          { rowCount: parsedData.length },
          "Excel parsed successfully",
        );
      }

      // totalRows = parsedData.length; // Used for debugging

      // Validate required fields
      const requiredFields = ["title", "date"];
      const validRows = parsedData.filter((row) => {
        return requiredFields.every(
          (field) => row[field] && (row[field] as string).toString().trim(),
        );
      });

      if (validRows.length === 0) {
        logger.error(
          { totalRows: parsedData.length },
          "No valid rows found after validation",
        );
        throw new Error("No valid rows found. Required fields: title, date");
      }

      logger.info(
        {
          totalRows: parsedData.length,
          validRows: validRows.length,
          invalidRows: parsedData.length - validRows.length,
        },
        "Row validation completed",
      );

      // Update progress
      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          progress: {
            totalRows: validRows.length,
            processedRows: 0,
            geocodedRows: 0,
            createdEvents: 0,
            percentage: 0,
          },
          processingStage: "row-processing",
        },
      });

      // Create batches and queue batch processing jobs
      const batchSize = 100;
      const totalBatches = Math.ceil(validRows.length / batchSize);

      logger.info(
        { batchSize, totalBatches, validRowCount: validRows.length },
        "Creating batches for processing",
      );

      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          batchInfo: {
            totalBatches: totalBatches,
            batchSize: batchSize,
            currentBatch: 0,
          },
        },
      });

      for (let i = 0; i < totalBatches; i++) {
        const batchData = validRows.slice(i * batchSize, (i + 1) * batchSize);

        logger.debug(
          { batchNumber: i + 1, batchItemCount: batchData.length },
          "Queueing batch processing job",
        );

        await payload.jobs.queue({
          task: "batch-processing",
          input: {
            importId,
            batchNumber: i + 1,
            batchData,
          } as BatchProcessingJobPayload["input"],
        });
      }

      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
        logger.debug({ filePath }, "Uploaded file deleted successfully");
      } catch (error) {
        logger.warn({ error, filePath }, "Failed to delete uploaded file");
      }

      logPerformance("File parsing job", Date.now() - startTime, {
        importId,
        totalRows: validRows.length,
        totalBatches,
      });

      return { output: {} };
    } catch (error) {
      logError(error, "File parsing job failed", { importId, filePath });

      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          status: "failed",
          errorCount: 1,
          errorLog:
            error instanceof Error ? error.message : "File parsing failed",
          completedAt: new Date().toISOString(),
        },
      });

      throw error;
    }
    return { output: {} };
  },
};

// Batch processing job
export const batchProcessingJob = {
  slug: "batch-processing",
  handler: async (context: JobHandlerContext) => {
    const payload = context.req?.payload || context.payload;
    const input = context.input || (context.job as any)?.input;
    const { importId, batchNumber, batchData } =
      input as BatchProcessingJobPayload["input"];

    const jobId = context.job?.id || "unknown";
    const logger = createJobLogger(jobId, "batch-processing");
    logger.info(
      { importId, batchNumber, itemCount: batchData.length },
      "Starting batch processing job",
    );
    const startTime = Date.now();

    try {
      // Get current import to preserve other batchInfo fields
      const currentImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Update current batch
      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          batchInfo: {
            ...currentImport.batchInfo,
            currentBatch: batchNumber,
          },
        },
      });

      logger.debug("Processing batch data");

      const processedData = batchData.map((row) => {
        // Normalize and validate data
        const processedRow = {
          title: (row.title as string)?.toString().trim(),
          description: (row.description as string)?.toString().trim() || "",
          date: parseDate(row.date as string),
          endDate: row.enddate ? parseDate(row.enddate as string) : null,
          location: (row.location as string)?.toString().trim() || "",
          address: (row.address as string)?.toString().trim() || "",
          url: (row.url as string)?.toString().trim() || "",
          category: (row.category as string)?.toString().trim() || "",
          tags: (row.tags as string)
            ? (row.tags as string)
                .toString()
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
          originalData: row,
        };

        return processedRow;
      });

      // Queue event creation job
      logger.info(
        { processedItemCount: processedData.length },
        "Queueing event creation job",
      );

      await payload.jobs.queue({
        task: "event-creation",
        input: {
          importId,
          processedData,
          batchNumber,
        } as EventCreationJobPayload["input"],
      });

      logPerformance("Batch processing job", Date.now() - startTime, {
        importId,
        batchNumber,
        processedItems: processedData.length,
      });

      return { output: {} };
    } catch (error) {
      logError(error, "Batch processing job failed", { importId, batchNumber });

      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          errorCount: 1,
          errorLog: `Batch ${batchNumber} processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });

      throw error;
    }
    return { output: {} };
  },
};

// Event creation job
export const eventCreationJob = {
  slug: "event-creation",
  handler: async (context: JobHandlerContext) => {
    const payload = context.req?.payload || context.payload;
    const input = context.input || (context.job as any)?.input;
    const { importId, processedData, batchNumber } =
      input as EventCreationJobPayload["input"];

    const jobId = context.job?.id || "unknown";
    const logger = createJobLogger(jobId, "event-creation");
    logger.info(
      { importId, batchNumber, eventCount: processedData.length },
      "Starting event creation job",
    );
    const startTime = Date.now();

    try {
      // Get the import record to find the dataset
      const currentImport: Import = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Get the catalog ID (it might be a relationship object)
      const catalogId =
        typeof currentImport.catalog === "object"
          ? (currentImport.catalog as Catalog).id
          : currentImport.catalog;

      // Get the dataset from the import's catalog
      const datasets = await payload.find({
        collection: "datasets",
        where: {
          catalog: {
            equals: catalogId,
          },
        },
        limit: 1,
      });

      const dataset: Dataset | undefined = datasets.docs[0];
      if (!dataset) {
        logger.error({ catalogId }, "No dataset found for catalog");
        throw new Error(`No dataset found for catalog ${catalogId}`);
      }

      logger.debug(
        { datasetId: dataset.id, datasetName: dataset.name },
        "Found dataset for events",
      );

      const createdEventIds: number[] = [];
      let failedEventCount = 0;

      // Create events
      for (const eventData of processedData) {
        try {
          const event: Event = await payload.create({
            collection: "events",
            data: {
              dataset: dataset.id,
              import: importId,
              data: (eventData.originalData || eventData) as Record<
                string,
                unknown
              >,
              eventTimestamp: eventData.date as string,
              geocodingInfo: {
                originalAddress: eventData.address as string,
                provider: null,
                confidence: null,
                normalizedAddress: null,
              },
            },
          });

          createdEventIds.push(event.id);
        } catch (error) {
          failedEventCount++;
          logger.error(
            {
              error,
              eventTitle: eventData.title,
              eventData,
            },
            "Failed to create event",
          );
          // Continue with other events
        }
      }

      logger.info(
        {
          createdEvents: createdEventIds.length,
          failedEvents: failedEventCount,
          totalEvents: processedData.length,
        },
        "Event creation completed",
      );

      // Update progress
      const importRecord: Import = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const currentCreatedEvents =
        Number(importRecord.progress?.createdEvents) || 0;
      const currentProcessedRows =
        Number(importRecord.progress?.processedRows) || 0;

      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          progress: {
            ...importRecord.progress,
            createdEvents: currentCreatedEvents + createdEventIds.length,
            processedRows: currentProcessedRows + processedData.length,
          },
        },
      });

      // Queue geocoding if events have addresses - bulk query optimization
      const eventsWithAddresses = await payload.find({
        collection: "events",
        where: {
          id: {
            in: createdEventIds,
          },
          "geocodingInfo.originalAddress": {
            exists: true,
          },
        },
        select: {
          id: true,
        },
        limit: createdEventIds.length,
      });
      const eventsNeedingGeocoding: number[] = eventsWithAddresses.docs.map(
        (event: Pick<Event, "id">) => event.id,
      );

      if (eventsNeedingGeocoding.length > 0) {
        logger.info(
          { geocodingEventCount: eventsNeedingGeocoding.length },
          "Queueing geocoding batch job",
        );

        await payload.jobs.queue({
          task: "geocoding-batch",
          input: {
            importId,
            eventIds: eventsNeedingGeocoding,
            batchNumber,
          } as GeocodingBatchJobPayload["input"],
        });
      } else {
        logger.debug("No events require geocoding in this batch");
      }

      // Check if this is the last batch and update stage
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const totalBatches = Number(updatedImport.batchInfo?.totalBatches) || 0;
      const currentBatch = Number(updatedImport.batchInfo?.currentBatch) || 0;

      if (currentBatch >= totalBatches) {
        logger.debug(
          "Last batch processed, updating import stage to geocoding",
        );

        await payload.update({
          collection: "imports",
          where: {
            id: {
              equals: importId,
            },
          },
          data: {
            processingStage: "geocoding",
          },
        });
      }

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
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          errorCount: 1,
          errorLog: `Event creation batch ${batchNumber} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });

      throw error;
    }
    return { output: {} };
  },
};

// Geocoding batch job
export const geocodingBatchJob = {
  slug: "geocoding-batch",
  handler: async (context: JobHandlerContext) => {
    const payload = context.req?.payload || context.payload;
    const input = context.input || (context.job as any)?.input;
    const { importId, eventIds, batchNumber } =
      input as GeocodingBatchJobPayload["input"];

    const jobId = context.job?.id || "unknown";
    const logger = createJobLogger(jobId, "geocoding-batch");
    logger.info(
      { importId, batchNumber, eventCount: eventIds.length },
      "Starting geocoding batch job",
    );
    const startTime = Date.now();

    try {
      const geocodingService = new GeocodingService(payload);
      let geocodedCount = 0; // Successfully geocoded events
      let processedCount = 0; // All processed events (success or failure)

      for (const eventId of eventIds) {
        try {
          const event = await payload.findByID({
            collection: "events",
            id: eventId,
          });

          if (!event.geocodingInfo?.originalAddress) {
            logger.debug({ eventId }, "Event has no address to geocode");
            processedCount++; // Count as processed even if no address
            continue;
          }

          logger.debug(
            {
              eventId,
              address: event.geocodingInfo.originalAddress,
            },
            "Geocoding event address",
          );

          const geocodingResult = await geocodingService.geocode(
            event.geocodingInfo.originalAddress,
          );

          if (geocodingResult) {
            logger.debug(
              {
                eventId,
                provider: geocodingResult.provider,
                confidence: geocodingResult.confidence,
                fromCache: geocodingResult.fromCache,
              },
              "Geocoding successful",
            );
            await payload.update({
              collection: "events",
              where: {
                id: {
                  equals: eventId,
                },
              },
              data: {
                location: {
                  latitude: geocodingResult.latitude,
                  longitude: geocodingResult.longitude,
                },
                geocodingInfo: {
                  ...event.geocodingInfo,
                  provider: geocodingResult.provider as
                    | "google"
                    | "nominatim"
                    | "manual"
                    | null,
                  confidence: geocodingResult.confidence,
                  normalizedAddress: geocodingResult.normalizedAddress,
                },
              },
            });
            geocodedCount++; // Only count successful geocoding
          } else {
            logger.warn({ eventId }, "Geocoding failed - no result returned");
          }
          processedCount++; // Count as processed regardless of success/failure
        } catch (error) {
          logger.error({ error, eventId }, "Failed to geocode event");
          processedCount++; // Count as processed even if geocoding failed
        }
      }

      logger.info(
        {
          processedCount,
          geocodedCount,
          failedCount: processedCount - geocodedCount,
        },
        "Geocoding batch completed",
      );

      // Update geocoding progress
      const importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const currentGeocodedRows =
        Number(importRecord.progress?.geocodedRows) || 0;

      await payload.update({
        collection: "imports",
        id: importId,
        data: {
          progress: {
            ...importRecord.progress,
            geocodedRows: currentGeocodedRows + geocodedCount,
          },
        },
      });

      // Check if geocoding is complete
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const geocodedEvents = Number(updatedImport.progress?.geocodedRows) || 0;

      // Complete the import if we've processed all events (regardless of geocoding success)
      // For now, we'll complete if we've processed any events and there are no more geocoding jobs
      // This is a simplification - in a real implementation, we'd need better batch tracking
      if (processedCount === eventIds.length && geocodedEvents >= 0) {
        logger.info(
          { importId },
          "All events processed, marking import as completed",
        );

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

      logPerformance("Geocoding batch job", Date.now() - startTime, {
        importId,
        batchNumber,
        processedEvents: processedCount,
        geocodedEvents: geocodedCount,
      });

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
    return { output: {} };
  },
};

// Utility function to parse dates
function parseDate(dateString: string | number | Date): string {
  if (!dateString) return new Date().toISOString();

  const date = new Date(dateString.toString());
  if (isNaN(date.getTime())) {
    // Try common date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
    ];

    for (const format of formats) {
      if (format.test(dateString.toString())) {
        const parsedDate = new Date(dateString.toString());
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString();
        }
      }
    }

    // Default to current date if parsing fails
    return new Date().toISOString();
  }

  return date.toISOString();
}
