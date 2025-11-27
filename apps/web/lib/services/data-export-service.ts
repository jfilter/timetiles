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
import path from "node:path";

import archiver from "archiver";
import { createWriteStream } from "fs";
import { mkdir, readFile, stat } from "fs/promises";
import type { Payload } from "payload";

import type { Catalog, Dataset, Event, ImportFile, ImportJob, Media, ScheduledImport } from "@/payload-types";

import { createLogger } from "../logger";
import type {
  CatalogExportData,
  DatasetExportData,
  EventExportData,
  ExecuteExportResult,
  ExportData,
  ExportManifest,
  ExportSummary,
  ImportFileExportData,
  ImportJobExportData,
  MediaExportData,
  ScheduledImportExportData,
  UserExportData,
} from "./data-export-types";

const logger = createLogger("data-export-service");

/** Number of events per chunk file */
const EVENTS_PER_CHUNK = 10000;

/** Directory for storing export files */
const EXPORT_DIR = process.env.DATA_EXPORT_DIR ?? ".exports";

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
    // Count catalogs
    const catalogs = await this.payload.count({
      collection: "catalogs",
      where: { createdBy: { equals: userId } },
      overrideAccess: true,
    });

    // Count datasets
    const datasets = await this.payload.count({
      collection: "datasets",
      where: { createdBy: { equals: userId } },
      overrideAccess: true,
    });

    // Get dataset IDs to count events - only fetch IDs (id is auto-included)
    const userDatasets = await this.payload.find({
      collection: "datasets",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
      select: { name: true },
    });

    const datasetIds = userDatasets.docs.map((d) => d.id);
    let eventsCount = 0;

    if (datasetIds.length > 0) {
      const events = await this.payload.count({
        collection: "events",
        where: { dataset: { in: datasetIds } },
        overrideAccess: true,
      });
      eventsCount = events.totalDocs;
    }

    // Count other collections
    const [importFiles, scheduledImports, media] = await Promise.all([
      this.payload.count({
        collection: "import-files",
        where: { user: { equals: userId } },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "scheduled-imports",
        where: { createdBy: { equals: userId } },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "media",
        where: { createdBy: { equals: userId } },
        overrideAccess: true,
      }),
    ]);

    // Count import jobs via import files - only fetch IDs (id is auto-included)
    const userImportFiles = await this.payload.find({
      collection: "import-files",
      where: { user: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
      select: { status: true },
    });
    const importFileIds = userImportFiles.docs.map((f) => f.id);

    let importJobsCount = 0;
    if (importFileIds.length > 0) {
      const importJobs = await this.payload.count({
        collection: "import-jobs",
        where: { importFile: { in: importFileIds } },
        overrideAccess: true,
      });
      importJobsCount = importJobs.totalDocs;
    }

    return {
      catalogs: catalogs.totalDocs,
      datasets: datasets.totalDocs,
      events: eventsCount,
      importFiles: importFiles.totalDocs,
      importJobs: importJobsCount,
      scheduledImports: scheduledImports.totalDocs,
      mediaFiles: media.totalDocs,
    };
  }

  /**
   * Fetch user profile data for export (sanitized).
   */
  private async fetchUserProfile(userId: number): Promise<UserExportData> {
    const user = await this.payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

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
    const result = await this.payload.find({
      collection: "catalogs",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map(
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
    const result = await this.payload.find({
      collection: "datasets",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map(
      (d: Dataset): DatasetExportData => ({
        id: d.id,
        name: d.name,
        description: d.description,
        slug: d.slug,
        isPublic: d.isPublic ?? false,
        language: d.language,
        catalogId: typeof d.catalog === "object" ? d.catalog.id : d.catalog,
        schemaConfig: d.schemaConfig,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })
    );
  }

  /**
   * Fetch events in batches using cursor-based pagination.
   */
  private async *fetchEventsBatched(datasetIds: number[]): AsyncGenerator<EventExportData[]> {
    if (datasetIds.length === 0) return;

    let lastId = 0;

    while (true) {
      const result = await this.payload.find({
        collection: "events",
        where: {
          and: [{ dataset: { in: datasetIds } }, { id: { greater_than: lastId } }],
        },
        limit: EVENTS_PER_CHUNK,
        sort: "id",
        overrideAccess: true,
      });

      if (result.docs.length === 0) break;

      const events: EventExportData[] = result.docs.map((e: Event) => ({
        id: e.id,
        datasetId: typeof e.dataset === "object" ? e.dataset.id : e.dataset,
        eventTimestamp: e.eventTimestamp,
        data: e.data,
        location: e.location
          ? {
              latitude: e.location.latitude,
              longitude: e.location.longitude,
            }
          : null,
        geocodingStatus: (e.geocodingInfo as { status?: string } | null)?.status,
        validationStatus: e.validationStatus,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));

      yield events;
      lastId = result.docs[result.docs.length - 1]?.id ?? lastId;

      // If we got fewer than the batch size, we're done
      if (result.docs.length < EVENTS_PER_CHUNK) break;
    }
  }

  /**
   * Fetch import files for export.
   */
  private async fetchImportFiles(userId: number): Promise<ImportFileExportData[]> {
    const result = await this.payload.find({
      collection: "import-files",
      where: { user: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map((f: ImportFile) => ({
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
  private async fetchImportJobs(importFileIds: number[]): Promise<ImportJobExportData[]> {
    if (importFileIds.length === 0) return [];

    const result = await this.payload.find({
      collection: "import-jobs",
      where: { importFile: { in: importFileIds } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map((j: ImportJob) => ({
      id: j.id,
      importFileId: typeof j.importFile === "object" ? j.importFile.id : j.importFile,
      datasetId: typeof j.dataset === "object" ? j.dataset.id : j.dataset,
      stage: j.stage,
      progress: j.progress,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));
  }

  /**
   * Fetch scheduled imports for export.
   */
  private async fetchScheduledImports(userId: number): Promise<ScheduledImportExportData[]> {
    const result = await this.payload.find({
      collection: "scheduled-imports",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map((s: ScheduledImport) => ({
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
    const result = await this.payload.find({
      collection: "media",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    return result.docs.map((m: Media) => ({
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
    const [user, catalogs, datasets, importFiles, scheduledImports, media] = await Promise.all([
      this.fetchUserProfile(userId),
      this.fetchCatalogs(userId),
      this.fetchDatasets(userId),
      this.fetchImportFiles(userId),
      this.fetchScheduledImports(userId),
      this.fetchMedia(userId),
    ]);

    // Fetch import jobs using the import file IDs
    const importFileIds = importFiles.map((f) => f.id);
    const importJobs = await this.fetchImportJobs(importFileIds);

    return {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      user,
      catalogs,
      datasets,
      importFiles,
      importJobs,
      scheduledImports,
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
    const exportDir = path.join(process.cwd(), EXPORT_DIR);
    await mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `timetiles-export-${userId}-${timestamp}-${exportId}.zip`;
    const outputPath = path.join(exportDir, filename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output.on("close", () => {
        stat(outputPath)
          .then((stats) => resolve({ filePath: outputPath, fileSize: stats.size }))
          .catch((err: Error) => reject(err));
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
      archive.append(JSON.stringify(baseData.importFiles, null, 2), { name: "import-files.json" });
      archive.append(JSON.stringify(baseData.importJobs, null, 2), { name: "import-jobs.json" });
      archive.append(JSON.stringify(baseData.scheduledImports, null, 2), {
        name: "scheduled-imports.json",
      });
      archive.append(JSON.stringify(baseData.media, null, 2), { name: "media/metadata.json" });

      // Process events and media asynchronously, then finalize
      this.addEventsAndMediaToArchive(archive, baseData)
        .then(() => archive.finalize())
        .catch((err: Error) => reject(err));
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
        // Media files are stored in the uploads directory
        const mediaPath = path.join(process.cwd(), "uploads", mediaItem.filename);
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

    const userId = typeof exportRecord.user === "object" ? exportRecord.user.id : exportRecord.user;

    logger.info({ exportId, userId }, "Starting data export");

    // Fetch all user data
    const baseData = await this.fetchAllUserData(userId);

    // Get summary for manifest
    const summary = await this.getExportSummary(userId);

    // Create archive
    const { filePath, fileSize } = await this.createArchive(exportId, userId, baseData, summary);

    logger.info({ exportId, userId, filePath, fileSize }, "Data export completed");

    return {
      success: true,
      exportId,
      filePath,
      fileSize,
      recordCounts: summary,
    };
  }
}

// Singleton instance
let dataExportService: DataExportService | null = null;

/**
 * Get the data export service singleton.
 */
export const getDataExportService = (payload: Payload): DataExportService => {
  dataExportService ??= new DataExportService(payload);
  return dataExportService;
};

/**
 * Reset the data export service singleton (for testing).
 */
export const resetDataExportService = (): void => {
  dataExportService = null;
};
