import type { JobConfig } from "payload";
import { getPayload } from "payload";
import config from "@payload-config";
import { GeocodingService } from "../services/geocoding/GeocodingService";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

// Job payload types
interface FileParsingJobPayload {
  importId: string;
  filePath: string;
  fileName: string;
  fileType: "csv" | "xlsx";
}

interface BatchProcessingJobPayload {
  importId: string;
  batchNumber: number;
  batchData: any[];
  totalBatches: number;
}

interface GeocodingBatchJobPayload {
  importId: string;
  eventIds: string[];
  batchNumber: number;
}

interface EventCreationJobPayload {
  importId: string;
  processedData: any[];
  batchNumber: number;
}

// File parsing job
export const fileParsingJob: JobConfig = {
  slug: "file-parsing",
  handler: async ({ job, payload }) => {
    const { importId, filePath, fileName, fileType } =
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

      let parsedData: any[] = [];
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
            `CSV parsing errors: ${parseResult.errors.map((e: any) => e.message).join(", ")}`,
          );
        }

        parsedData = parseResult.data;
      } else if (fileType === "xlsx") {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        // Convert to object format with headers
        if (parsedData.length > 0) {
          const headers = (parsedData[0] as string[]).map((h) =>
            h.toString().trim().toLowerCase(),
          );
          parsedData = parsedData.slice(1).map((row: any[]) => {
            const obj: any = {};
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
          (field) => row[field] && row[field].toString().trim(),
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
          "progress.totalRows": totalRows,
          "progress.processedRows": 0,
          processingStage: "batch-processing",
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
          "batchInfo.totalBatches": totalBatches,
          "batchInfo.batchSize": batchSize,
          "batchInfo.currentBatch": 0,
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
            totalBatches,
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
          "errors.0": {
            message:
              error instanceof Error ? error.message : "File parsing failed",
            timestamp: new Date().toISOString(),
          },
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
    const { importId, batchNumber, batchData, totalBatches } =
      job.input as BatchProcessingJobPayload;

    try {
      // Update current batch
      await payload.update({
        collection: "imports",
        where: {
          id: {
            equals: importId,
          },
        },
        data: {
          "batchInfo.currentBatch": batchNumber,
        },
      });

      const processedData = batchData.map((row) => {
        // Normalize and validate data
        const processedRow = {
          title: row.title?.toString().trim(),
          description: row.description?.toString().trim() || "",
          date: parseDate(row.date),
          endDate: row.enddate ? parseDate(row.enddate) : null,
          location: row.location?.toString().trim() || "",
          address: row.address?.toString().trim() || "",
          url: row.url?.toString().trim() || "",
          category: row.category?.toString().trim() || "",
          tags: row.tags
            ? row.tags
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
          "errors.0": {
            message: `Batch ${batchNumber} processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  },
};

// Event creation job
export const eventCreationJob = {
  slug: "event-creation",
  handler: async ({ job, payload }: { job: any; payload: any }) => {
    const { importId, processedData, batchNumber } =
      job.input as EventCreationJobPayload;

    try {
      const createdEventIds: string[] = [];

      // Create events
      for (const eventData of processedData) {
        try {
          const event = await payload.create({
            collection: "events",
            data: {
              title: eventData.title,
              description: eventData.description,
              date: eventData.date,
              endDate: eventData.endDate,
              location: eventData.location,
              url: eventData.url,
              category: eventData.category,
              tags: eventData.tags,
              importId,
              // Geocoding fields will be populated later
              geocoding: {
                originalAddress: eventData.address,
                needsGeocoding: !!eventData.address,
                provider: null,
                confidence: null,
                normalizedAddress: null,
                geocodedAt: null,
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
          "progress.createdEvents":
            currentCreatedEvents + createdEventIds.length,
          "progress.processedRows": currentProcessedRows + processedData.length,
        },
      });

      // Queue geocoding if events have addresses
      const eventsNeedingGeocoding = [];
      for (const eventId of createdEventIds) {
        const event = await payload.findByID({
          collection: "events",
          id: eventId,
        });
        if (event.geocoding?.needsGeocoding) {
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
          "errors.0": {
            message: `Event creation batch ${batchNumber} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  },
};

// Geocoding batch job
export const geocodingBatchJob = {
  slug: "geocoding-batch",
  handler: async ({ job, payload }: { job: any; payload: any }) => {
    const { importId, eventIds, batchNumber } =
      job.input as GeocodingBatchJobPayload;

    try {
      const geocodingService = new GeocodingService(payload);
      let geocodedCount = 0;

      for (const eventId of eventIds) {
        try {
          const event = await payload.findByID({
            collection: "events",
            id: eventId,
          });

          if (!event.geocoding?.originalAddress) {
            continue;
          }

          const geocodingResult = await geocodingService.geocode(
            event.geocoding.originalAddress,
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
                latitude: geocodingResult.latitude,
                longitude: geocodingResult.longitude,
                "geocoding.provider": geocodingResult.provider,
                "geocoding.confidence": geocodingResult.confidence,
                "geocoding.normalizedAddress":
                  geocodingResult.normalizedAddress,
                "geocoding.geocodedAt": new Date().toISOString(),
                "geocoding.needsGeocoding": false,
              },
            });
            geocodedCount++;
          }
        } catch (error) {
          console.error("Failed to geocode event:", eventId, error);
          // Continue with other events
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
          "progress.geocodedRows": currentGeocodedRows + geocodedCount,
        },
      });

      // Check if geocoding is complete
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      const totalEvents = Number(updatedImport.progress?.createdEvents) || 0;
      const geocodedEvents = Number(updatedImport.progress?.geocodedRows) || 0;

      if (geocodedEvents >= totalEvents) {
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
          "errors.0": {
            message: `Geocoding batch ${batchNumber} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  },
};

// Utility function to parse dates
function parseDate(dateString: any): string {
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
