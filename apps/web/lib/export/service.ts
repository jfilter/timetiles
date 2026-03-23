/**
 * Service for exporting user data as a downloadable ZIP archive.
 *
 * Collects all user data (catalogs, datasets, events, media, etc.) and
 * packages it into a ZIP file with JSON files for each collection.
 * Events are chunked into multiple files for large datasets.
 *
 * @module
 * @category Services
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import archiver from "archiver";
import type { Payload } from "payload";

import { getEnv } from "@/lib/config/env";
import { requireRelationId } from "@/lib/utils/relation-id";
import { countUserDocs, findUserDocs } from "@/lib/utils/user-data";
import type { Catalog, Dataset, Event, IngestFile, IngestJob, Media, ScheduledIngest } from "@/payload-types";

import { createLogger } from "../logger";
import type {
  CatalogExportData,
  DatasetExportData,
  EventExportData,
  ExecuteExportResult,
  ExportData,
  ExportManifest,
  ExportSummary,
  IngestFileExportData,
  IngestJobExportData,
  MediaExportData,
  ScheduledIngestExportData,
  UserExportData,
} from "./types";

const logger = createLogger("data-export-service");

/** Number of events per chunk file */
const EVENTS_PER_CHUNK = 10000;

/** Directory for storing export files */
const EXPORT_DIR = getEnv().DATA_EXPORT_DIR;

/**
 * Service for creating user data exports.
 */
export class DataExportService {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Get a summary of data that will be exported.
   */
  async getExportSummary(userId: number): Promise<ExportSummary> {
    // Count top-level collections in parallel
    const [catalogs, datasets, importFilesCount, scheduledIngests, mediaFiles] = await Promise.all([
      countUserDocs(this.payload, "catalogs", userId),
      countUserDocs(this.payload, "datasets", userId),
      countUserDocs(this.payload, "ingest-files", userId, { userField: "user" }),
      countUserDocs(this.payload, "scheduled-ingests", userId),
      countUserDocs(this.payload, "media", userId),
    ]);

    // Get dataset IDs to count events
    const userDatasets = await findUserDocs(this.payload, "datasets", userId, { limit: 10000 });
    const datasetIds = userDatasets.map((d) => d.id);

    let eventsCount = 0;
    if (datasetIds.length > 0) {
      const events = await this.payload.count({
        collection: "events",
        where: { dataset: { in: datasetIds } },
        overrideAccess: true,
      });
      eventsCount = events.totalDocs;
    }

    // Count import jobs via import files
    const userIngestFiles = await findUserDocs(this.payload, "ingest-files", userId, {
      userField: "user",
      limit: 10000,
    });
    const importFileIds = userIngestFiles.map((f) => f.id);

    let importJobsCount = 0;
    if (importFileIds.length > 0) {
      const importJobs = await this.payload.count({
        collection: "ingest-jobs",
        where: { ingestFile: { in: importFileIds } },
        overrideAccess: true,
      });
      importJobsCount = importJobs.totalDocs;
    }

    return {
      catalogs,
      datasets,
      events: eventsCount,
      importFiles: importFilesCount,
      importJobs: importJobsCount,
      scheduledIngests,
      mediaFiles,
    };
  }

  /**
   * Fetch user profile data for export (sanitized).
   */
  private async fetchUserProfile(userId: number): Promise<UserExportData> {
    const user = await this.payload.findByID({ collection: "users", id: userId, overrideAccess: true });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      trustLevel: user.trustLevel,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Fetch catalogs for export.
   */
  private async fetchCatalogs(userId: number): Promise<CatalogExportData[]> {
    const docs = await findUserDocs(this.payload, "catalogs", userId, { limit: 10000 });

    return docs.map(
      (c: Catalog): CatalogExportData => ({
        id: c.id,
        name: c.name,
        description: c.description,
        slug: c.slug,
        isPublic: c.isPublic ?? false,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
    );
  }

  /**
   * Fetch datasets for export.
   */
  private async fetchDatasets(userId: number): Promise<DatasetExportData[]> {
    const docs = await findUserDocs(this.payload, "datasets", userId, { limit: 10000 });

    return docs.map(
      (d: Dataset): DatasetExportData => ({
        id: d.id,
        name: d.name,
        description: d.description,
        slug: d.slug,
        isPublic: d.isPublic ?? false,
        language: d.language,
        catalogId: requireRelationId(d.catalog, "dataset.catalog"),
        schemaConfig: d.schemaConfig,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })
    );
  }

  /**
   * Fetch events in batches using cursor-based pagination.
   *
   * @yields {EventExportData[]} Batch of exported event data
   */
  private async *fetchEventsBatched(datasetIds: number[]): AsyncGenerator<EventExportData[]> {
    if (datasetIds.length === 0) return;

    let lastId = 0;

    while (true) {
      const result = await this.payload.find({
        collection: "events",
        where: { and: [{ dataset: { in: datasetIds } }, { id: { greater_than: lastId } }] },
        limit: EVENTS_PER_CHUNK,
        sort: "id",
        overrideAccess: true,
      });

      if (result.docs.length === 0) break;

      const events: EventExportData[] = result.docs.map((e: Event) => ({
        id: e.id,
        datasetId: requireRelationId(e.dataset, "event.dataset"),
        eventTimestamp: e.eventTimestamp,
        originalData: e.originalData,
        location: e.location ? { latitude: e.location.latitude, longitude: e.location.longitude } : null,
        geocodingStatus: (e.geocodingInfo as { status?: string } | null)?.status,
        validationStatus: e.validationStatus,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));

      yield events;
      lastId = result.docs.at(-1)?.id ?? lastId;

      // If we got fewer than the batch size, we're done
      if (result.docs.length < EVENTS_PER_CHUNK) break;
    }
  }

  /**
   * Fetch import files for export.
   */
  private async fetchIngestFiles(userId: number): Promise<IngestFileExportData[]> {
    const docs = await findUserDocs(this.payload, "ingest-files", userId, { userField: "user", limit: 10000 });

    return docs.map((f: IngestFile) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      filesize: f.filesize,
      status: f.status,
      createdAt: f.createdAt,
    }));
  }

  /**
   * Fetch import jobs for export.
   */
  private async fetchIngestJobs(importFileIds: number[]): Promise<IngestJobExportData[]> {
    if (importFileIds.length === 0) return [];

    const result = await this.payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { in: importFileIds } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map((j: IngestJob) => ({
      id: j.id,
      ingestFileId: requireRelationId(j.ingestFile, "ingestJob.ingestFile"),
      datasetId: requireRelationId(j.dataset, "ingestJob.dataset"),
      stage: j.stage,
      progress: j.progress,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));
  }

  /**
   * Fetch scheduled ingests for export.
   */
  private async fetchScheduledIngests(userId: number): Promise<ScheduledIngestExportData[]> {
    const docs = await findUserDocs(this.payload, "scheduled-ingests", userId, { limit: 10000 });

    return docs.map((s: ScheduledIngest) => ({
      id: s.id,
      name: s.name,
      sourceUrl: s.sourceUrl,
      enabled: s.enabled ?? false,
      scheduleType: s.scheduleType,
      frequency: s.frequency,
      cronExpression: s.cronExpression,
      lastRun: s.lastRun,
      nextRun: s.nextRun,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Fetch media metadata for export.
   */
  private async fetchMedia(userId: number): Promise<MediaExportData[]> {
    const docs = await findUserDocs(this.payload, "media", userId, { limit: 10000 });

    return docs.map((m: Media) => ({
      id: m.id,
      filename: m.filename ?? "",
      mimeType: m.mimeType,
      filesize: m.filesize,
      width: m.width,
      height: m.height,
      alt: m.alt,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Fetch all user data for export (except events which are batched).
   */
  async fetchAllUserData(userId: number): Promise<Omit<ExportData, "events">> {
    const [user, catalogs, datasets, importFiles, scheduledIngests, media] = await Promise.all([
      this.fetchUserProfile(userId),
      this.fetchCatalogs(userId),
      this.fetchDatasets(userId),
      this.fetchIngestFiles(userId),
      this.fetchScheduledIngests(userId),
      this.fetchMedia(userId),
    ]);

    // Fetch import jobs using the import file IDs
    const importFileIds = importFiles.map((f) => f.id);
    const importJobs = await this.fetchIngestJobs(importFileIds);

    return {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      user,
      catalogs,
      datasets,
      importFiles,
      importJobs,
      scheduledIngests,
      media,
    };
  }

  /**
   * Create ZIP archive from export data.
   */
  async createArchive(
    exportId: number,
    userId: number,
    baseData: Omit<ExportData, "events">,
    summary: ExportSummary
  ): Promise<{ filePath: string; fileSize: number }> {
    // Ensure export directory exists
    const exportDir = path.isAbsolute(EXPORT_DIR) ? EXPORT_DIR : path.join(process.cwd(), EXPORT_DIR);
    await mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `timetiles-export-${userId}-${timestamp}-${exportId}.zip`;
    const outputPath = path.join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output.on("close", () => {
        void (async () => {
          try {
            const stats = await stat(outputPath);
            resolve({ filePath: outputPath, fileSize: stats.size });
          } catch (err) {
            reject(err as Error);
          }
        })();
      });

      archive.on("error", (err: Error) => reject(err));
      archive.pipe(output);

      // Add manifest
      const manifest: ExportManifest = {
        exportedAt: baseData.exportedAt,
        version: baseData.version,
        userId,
        recordCounts: summary,
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      // Add user profile
      archive.append(JSON.stringify(baseData.user, null, 2), { name: "profile.json" });

      // Add collections
      archive.append(JSON.stringify(baseData.catalogs, null, 2), { name: "catalogs.json" });
      archive.append(JSON.stringify(baseData.datasets, null, 2), { name: "datasets.json" });
      archive.append(JSON.stringify(baseData.importFiles, null, 2), { name: "ingest-files.json" });
      archive.append(JSON.stringify(baseData.importJobs, null, 2), { name: "import-jobs.json" });
      archive.append(JSON.stringify(baseData.scheduledIngests, null, 2), { name: "scheduled-ingests.json" });
      archive.append(JSON.stringify(baseData.media, null, 2), { name: "media/metadata.json" });

      // Process events and media asynchronously, then finalize
      void (async () => {
        try {
          await this.addEventsAndMediaToArchive(archive, baseData);
          await archive.finalize();
        } catch (err) {
          reject(err as Error);
        }
      })();
    });
  }

  /**
   * Add events and media files to archive.
   */
  private async addEventsAndMediaToArchive(
    archive: archiver.Archiver,
    baseData: Omit<ExportData, "events">
  ): Promise<void> {
    // Get dataset IDs for events
    const datasetIds = baseData.datasets.map((d) => d.id);

    // Add events in chunks
    let chunkIndex = 1;
    for await (const eventChunk of this.fetchEventsBatched(datasetIds)) {
      const chunkName = `events/events-${String(chunkIndex).padStart(4, "0")}.json`;
      archive.append(JSON.stringify(eventChunk, null, 2), { name: chunkName });
      chunkIndex++;
    }

    // Add actual media files if they exist
    for (const mediaItem of baseData.media) {
      try {
        // Media files are stored in the uploads directory (respect UPLOAD_DIR env var)
        const uploadDir = getEnv().UPLOAD_DIR;
        const baseDir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
        const mediaPath = path.join(baseDir, "media", mediaItem.filename);
        const fileExists = await stat(mediaPath).catch(() => null);

        if (fileExists) {
          const fileContent = await readFile(mediaPath);
          archive.append(fileContent, { name: `media/files/${mediaItem.filename}` });
        }
      } catch {
        // Log but continue - missing files shouldn't fail the export
        logger.warn({ mediaId: mediaItem.id, filename: mediaItem.filename }, "Media file not found");
      }
    }
  }

  /**
   * Execute the full export process.
   */
  async executeExport(exportId: number): Promise<ExecuteExportResult> {
    // Fetch export record
    const exportRecord = await this.payload.findByID({
      collection: "data-exports",
      id: exportId,
      overrideAccess: true,
    });

    if (!exportRecord) {
      throw new Error(`Export record not found: ${exportId}`);
    }

    const userId = requireRelationId(exportRecord.user, "exportRecord.user");

    logger.info({ exportId, userId }, "Starting data export");

    // Fetch all user data
    const baseData = await this.fetchAllUserData(userId);

    // Get summary for manifest
    const summary = await this.getExportSummary(userId);

    // Create archive
    const { filePath, fileSize } = await this.createArchive(exportId, userId, baseData, summary);

    logger.info({ exportId, userId, filePath, fileSize }, "Data export completed");

    return { success: true, exportId, filePath, fileSize, recordCounts: summary };
  }
}

/**
 * Create a data export service instance.
 *
 * Returns a fresh instance each call. The service is stateless (all data
 * lives in the database), so there is no benefit to caching the instance.
 */
export const createDataExportService = (payload: Payload): DataExportService => new DataExportService(payload);
