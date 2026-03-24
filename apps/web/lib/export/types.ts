/**
 * Types for the data export service.
 *
 * Defines interfaces for export summaries, results, and data structures
 * used when exporting user data to a downloadable archive.
 *
 * @module
 * @category Services
 */

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
export type DataExportStatus = "pending" | "processing" | "ready" | "failed" | "expired";

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
export interface UserExportData {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  trustLevel?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
}

/**
 * Catalog data for export.
 */
export interface CatalogExportData {
  id: number;
  name: string;
  description?: unknown;
  slug?: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dataset data for export.
 */
export interface DatasetExportData {
  id: number;
  name: string;
  description?: unknown;
  slug?: string | null;
  isPublic: boolean;
  language?: string | null;
  catalogId: number;
  schemaConfig?: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event data for export.
 */
export interface EventExportData {
  id: number;
  datasetId: number;
  eventTimestamp?: string | null;
  originalData: unknown;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  geocodingStatus?: string | null;
  validationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ingest file metadata for export.
 */
export interface IngestFileExportData {
  id: number;
  originalName?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
  status?: string | null;
  createdAt: string;
}

/**
 * Ingest job data for export.
 */
export interface IngestJobExportData {
  id: number;
  ingestFileId: number;
  datasetId: number;
  stage?: string | null;
  progress?: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * scheduled ingest configuration for export.
 */
export interface ScheduledIngestExportData {
  id: number;
  name: string;
  sourceUrl: string;
  enabled: boolean;
  scheduleType?: string | null;
  frequency?: string | null;
  cronExpression?: string | null;
  lastRun?: string | null;
  nextRun?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Media file metadata for export.
 */
export interface MediaExportData {
  id: number;
  filename: string;
  mimeType?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  createdAt: string;
}

/**
 * Dataset schema data for export.
 */
export interface DatasetSchemaExportData {
  id: number;
  datasetId: number;
  versionNumber: number;
  schema: unknown;
  fieldMetadata: unknown;
  eventCountAtCreation?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Audit log entry for export (sanitized — no IP addresses).
 */
export interface AuditLogExportData {
  id: number;
  action: string;
  timestamp: string;
  details?: unknown;
  createdAt: string;
}

/**
 * Scraper repo data for export.
 */
export interface ScraperRepoExportData {
  id: number;
  name: string;
  sourceType: string;
  gitUrl?: string | null;
  gitBranch?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scraper data for export.
 */
export interface ScraperExportData {
  id: number;
  name: string;
  slug: string;
  repoId: number;
  runtime: string;
  entrypoint: string;
  outputFile?: string | null;
  schedule?: string | null;
  enabled?: boolean | null;
  timeoutSecs?: number | null;
  memoryMb?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scraper run data for export.
 */
export interface ScraperRunExportData {
  id: number;
  scraperId: number;
  status: string;
  triggeredBy?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  exitCode?: number | null;
  outputRows?: number | null;
  outputBytes?: number | null;
  createdAt: string;
}

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
