import type { Job, JobConfig, Payload } from "payload";
import { GeocodingService } from "../services/geocoding/GeocodingService";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs";

// Job payload types
interface FileParsingJobPayload {
  importId: string;
  filePath: string;
  fileType: "csv" | "xlsx";
}

interface BatchProcessingJobPayload {
  importId: string;
  batchNumber: number;
  batchData: Record<string, unknown>[];
}

interface GeocodingBatchJobPayload {
  importId: string;
  eventIds: string[];
  batchNumber: number;
}

interface EventCreationJobPayload {
  importId: string;
  processedData: Record<string, unknown>[];
  batchNumber: number;
}

// File parsing job
export const fileParsingJob: JobConfig = {
  slug: "file-parsing",
  handler: async ({ job, payload }) => {
    const { importId, filePath, fileType } =
      job.input as FileParsingJobPayload;

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
          startedAt: new Date().toISOString(),
        },
      });

      let parsedData: Record<string, unknown>[] = [];
      let totalRows = 0;

      if (fileType === "csv") {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const parseResult = Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header: string) => header.trim().toLowerCase(),
        });

        if (parseResult.errors.length > 0) {
          throw new Error(
            `CSV parsing errors: ${parseResult.errors.map((e: Papa.ParseError) => e.message).join(", ")}`,
          );
        }

        parsedData = parseResult.data as Record<string, unknown>[];
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
          parsedData = jsonData.slice(1).map((row: unknown[]) => {
            const obj: Record<string, unknown> = {};
            headers.forEach((header, index) => {
              obj[header] = row[index] || "";
            });
            return obj;
          });
        }
      }

      totalRows = parsedData.length;

      // Validate required fields
      const requiredFields = ["title", "date"];
      const validRows = parsedData.filter((row) => {
        return requiredFields.every(
          (field) => row[field] && (row[field] as string).toString().trim(),
        );
      });

      if (validRows.length === 0) {
        throw new Error("No valid rows found. Required fields: title, date");
      }

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

        await payload.jobs.queue({
          task: "batch-processing",
          input: {
            importId,
            batchNumber: i + 1,
            batchData,
          } as BatchProcessingJobPayload,
        });
      }

      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn("Failed to delete uploaded file:", error);
      }
    } catch (error) {
      console.error("File parsing job failed:", error);

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
  },
};

// Batch processing job
export const batchProcessingJob: JobConfig = {
  slug: "batch-processing",
  handler: async ({ job, payload }) => {
    const { importId, batchNumber, batchData } =
      job.input as BatchProcessingJobPayload;

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

      const processedData = batchData.map((row) => {
        // Normalize and validate data
        const processedRow = {
          title: (row.title as string)?.toString().trim(),
          description: (row.description as string)?.toString().trim() || "",
          date: parseDate(row.date),
          endDate: row.enddate ? parseDate(row.enddate) : null,
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
      await payload.jobs.queue({
        task: "event-creation",
        input: {
          importId,
          processedData,
          batchNumber,
        } as EventCreationJobPayload,
      });
    } catch (error) {
      console.error("Batch processing job failed:", error);

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
  },
};

// Event creation job
export const eventCreationJob = {
  slug: "event-creation",
  handler: async ({ job, payload }: { job: Job; payload: Payload }) => {
    const { importId, processedData, batchNumber } =
      job.input as EventCreationJobPayload;

    try {
      // Get the import record to find the dataset
      const currentImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Get the catalog ID (it might be a relationship object)
      const catalogId =
        typeof currentImport.catalog === "object"
          ? currentImport.catalog.id
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

      const dataset = datasets.docs[0];
      if (!dataset) {
        throw new Error(`No dataset found for catalog ${catalogId}`);
      }

      const createdEventIds: string[] = [];

      // Create events
      for (const eventData of processedData) {
        try {
          const event = await payload.create({
            collection: "events",
            data: {
              dataset: dataset.id,
              import: importId,
              data: eventData.originalData || eventData,
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
          console.error("Failed to create event:", eventData.title, error);
          // Continue with other events
        }
      }

      // Update progress
      const importRecord = await payload.findByID({
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

      // Queue geocoding if events have addresses
      const eventsNeedingGeocoding = [];
      for (const eventId of createdEventIds) {
        const event = await payload.findByID({
          collection: "events",
          id: eventId,
        });
        if (event.geocodingInfo?.originalAddress) {
          eventsNeedingGeocoding.push(eventId);
        }
      }

      if (eventsNeedingGeocoding.length > 0) {
        await payload.jobs.queue({
          task: "geocoding-batch",
          input: {
            importId,
            eventIds: eventsNeedingGeocoding,
            batchNumber,
          } as GeocodingBatchJobPayload,
        });
      }

      // Check if this is the last batch and update stage
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const totalBatches = Number(updatedImport.batchInfo?.totalBatches) || 0;
      const currentBatch = Number(updatedImport.batchInfo?.currentBatch) || 0;

      if (currentBatch >= totalBatches) {
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
    } catch (error) {
      console.error("Event creation job failed:", error);

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
  },
};

// Geocoding batch job
export const geocodingBatchJob = {
  slug: "geocoding-batch",
  handler: async ({ job, payload }: { job: Job; payload: Payload }) => {
    const { importId, eventIds, batchNumber } =
      job.input as GeocodingBatchJobPayload;

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
            processedCount++; // Count as processed even if no address
            continue;
          }

          const geocodingResult = await geocodingService.geocode(
            event.geocodingInfo.originalAddress,
          );

          if (geocodingResult) {
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
                  provider: geocodingResult.provider,
                  confidence: geocodingResult.confidence,
                  normalizedAddress: geocodingResult.normalizedAddress,
                },
              },
            });
            geocodedCount++; // Only count successful geocoding
          }
          processedCount++; // Count as processed regardless of success/failure
        } catch (error) {
          console.error("Failed to geocode event:", eventId, error);
          processedCount++; // Count as processed even if geocoding failed
        }
      }

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
    } catch (error) {
      console.error("Geocoding batch job failed:", error);

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
