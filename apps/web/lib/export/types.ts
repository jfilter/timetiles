/**
 * Types for the data export service.
 *
 * Defines interfaces for export summaries, results, and data structures
 * used when exporting user data to a downloadable archive.
 *
 * @module
 * @category Services
 */
import type {
  AuditLog,
  Catalog,
  DataExport as DataExportRecord,
  Dataset,
  DatasetSchema,
  Event,
  IngestFile,
  IngestJob,
  Media,
  ScheduledIngest,
  Scraper,
  ScraperRepo,
  ScraperRun,
  User,
} from "@/payload-types";

/**
 * Summary of data counts that will be exported.
 */
export interface ExportSummary {
  catalogs: number;
  datasets: number;
  events: number;
  importFiles: number;
  importJobs: number;
  scheduledIngests: number;
  mediaFiles: number;
  datasetSchemas: number;
  auditLogEntries: number;
  scraperRepos: number;
  scrapers: number;
  scraperRuns: number;
}

/**
 * Status of a data export request.
 */
export type DataExportStatus = DataExportRecord["status"];

/**
 * Result of initiating an export request.
 */
export interface CreateExportResult {
  success: boolean;
  exportId: number;
  summary: ExportSummary;
}

/**
 * Result of executing the export job.
 */
export interface ExecuteExportResult {
  success: boolean;
  exportId: number;
  filePath: string;
  fileSize: number;
  recordCounts: ExportSummary;
}

/**
 * User profile data for export (sanitized).
 */
export type UserExportData = Pick<
  User,
  "id" | "email" | "firstName" | "lastName" | "role" | "trustLevel" | "createdAt" | "lastLoginAt"
>;

/**
 * Catalog data for export.
 */
export type CatalogExportData = Pick<Catalog, "id" | "name" | "description" | "slug" | "createdAt" | "updatedAt"> & {
  isPublic: boolean;
};

/**
 * Dataset data for export.
 */
export type DatasetExportData = Pick<
  Dataset,
  "id" | "name" | "description" | "slug" | "language" | "schemaConfig" | "createdAt" | "updatedAt"
> & { isPublic: boolean; catalogId: number };

/**
 * Event data for export.
 */
export type EventExportData = Pick<Event, "id" | "eventTimestamp" | "transformedData" | "createdAt" | "updatedAt"> & {
  datasetId: number;
  location?: Event["location"] | null;
  geocodingStatus?: NonNullable<Event["geocodingInfo"]>["geocodingStatus"];
  validationStatus?: Event["validationStatus"];
};

/**
 * Ingest file metadata for export.
 */
export type IngestFileExportData = Pick<
  IngestFile,
  "id" | "originalName" | "mimeType" | "filesize" | "status" | "createdAt"
>;

/**
 * Ingest job data for export.
 */
export type IngestJobExportData = Pick<IngestJob, "id" | "stage" | "progress" | "createdAt" | "updatedAt"> & {
  ingestFileId: number;
  datasetId: number;
};

/**
 * scheduled ingest configuration for export.
 */
export type ScheduledIngestExportData = Pick<
  ScheduledIngest,
  | "id"
  | "name"
  | "sourceUrl"
  | "scheduleType"
  | "frequency"
  | "cronExpression"
  | "lastRun"
  | "nextRun"
  | "createdAt"
  | "updatedAt"
> & { enabled: boolean };

/**
 * Media file metadata for export.
 */
export type MediaExportData = Pick<Media, "id" | "mimeType" | "filesize" | "width" | "height" | "alt" | "createdAt"> & {
  filename: string;
};

/**
 * Dataset schema data for export.
 */
export type DatasetSchemaExportData = Pick<
  DatasetSchema,
  "id" | "versionNumber" | "schema" | "fieldMetadata" | "eventCountAtCreation" | "createdAt" | "updatedAt"
> & { datasetId: number };

/**
 * Audit log entry for export (sanitized — no IP addresses).
 */
export type AuditLogExportData = Pick<AuditLog, "id" | "action" | "timestamp" | "details" | "createdAt">;

/**
 * Scraper repo data for export.
 */
export type ScraperRepoExportData = Pick<
  ScraperRepo,
  "id" | "name" | "sourceType" | "gitUrl" | "gitBranch" | "lastSyncAt" | "lastSyncStatus" | "createdAt" | "updatedAt"
>;

/**
 * Scraper data for export.
 */
export type ScraperExportData = Pick<
  Scraper,
  | "id"
  | "name"
  | "slug"
  | "runtime"
  | "entrypoint"
  | "outputFile"
  | "schedule"
  | "enabled"
  | "timeoutSecs"
  | "memoryMb"
  | "createdAt"
  | "updatedAt"
> & { repoId: number };

/**
 * Scraper run data for export.
 */
export type ScraperRunExportData = Pick<
  ScraperRun,
  | "id"
  | "status"
  | "triggeredBy"
  | "startedAt"
  | "finishedAt"
  | "durationMs"
  | "exitCode"
  | "outputRows"
  | "outputBytes"
  | "createdAt"
> & { scraperId: number };

/**
 * Complete export data structure.
 */
export interface ExportData {
  exportedAt: string;
  version: string;
  user: UserExportData;
  catalogs: CatalogExportData[];
  datasets: DatasetExportData[];
  events: EventExportData[];
  importFiles: IngestFileExportData[];
  importJobs: IngestJobExportData[];
  scheduledIngests: ScheduledIngestExportData[];
  media: MediaExportData[];
  datasetSchemas: DatasetSchemaExportData[];
  auditLog: AuditLogExportData[];
  scraperRepos: ScraperRepoExportData[];
  scrapers: ScraperExportData[];
  scraperRuns: ScraperRunExportData[];
}

/**
 * Manifest file structure for the export ZIP.
 */
export interface ExportManifest {
  exportedAt: string;
  version: string;
  userId: number;
  recordCounts: ExportSummary;
}
