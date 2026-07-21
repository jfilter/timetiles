/**
 * ZIP archive writing for user data exports.
 *
 * Split out of `service.ts` so the stream lifecycle — in particular the
 * partial-file cleanup that keeps user PII from being orphaned on disk — lives
 * in one small, readable place.
 *
 * @module
 * @category Services
 */
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";

import { type Archiver, ZipArchive } from "archiver";

import { createLogger } from "../logger";
import type { ExportData, ExportManifest, ExportSummary } from "./types";

const logger = createLogger("data-export-archive");

/** Adds the event chunks and media blobs; supplied by the service (needs Payload). */
export type AddEventsAndMedia = (archive: Archiver, baseData: Omit<ExportData, "events">) => Promise<void>;

export interface ArchiveResult {
  filePath: string;
  fileSize: number;
}

interface WriteArchiveOptions {
  outputPath: string;
  userId: number;
  baseData: Omit<ExportData, "events">;
  summary: ExportSummary;
  addEventsAndMedia: AddEventsAndMedia;
}

/** Append every collection JSON to the archive, then finalize asynchronously. */
const appendCollections = (
  archive: Archiver,
  { userId, baseData, summary, addEventsAndMedia }: WriteArchiveOptions,
  fail: (err: unknown) => void
): void => {
  const manifest: ExportManifest = {
    exportedAt: baseData.exportedAt,
    version: baseData.version,
    userId,
    recordCounts: summary,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.append(JSON.stringify(baseData.user, null, 2), { name: "profile.json" });
  archive.append(JSON.stringify(baseData.catalogs, null, 2), { name: "catalogs.json" });
  archive.append(JSON.stringify(baseData.datasets, null, 2), { name: "datasets.json" });
  archive.append(JSON.stringify(baseData.datasetSchemas, null, 2), { name: "dataset-schemas.json" });
  archive.append(JSON.stringify(baseData.importFiles, null, 2), { name: "ingest-files.json" });
  archive.append(JSON.stringify(baseData.importJobs, null, 2), { name: "import-jobs.json" });
  archive.append(JSON.stringify(baseData.scheduledIngests, null, 2), { name: "scheduled-ingests.json" });
  archive.append(JSON.stringify(baseData.media, null, 2), { name: "media/metadata.json" });
  archive.append(JSON.stringify(baseData.auditLog, null, 2), { name: "audit-log.json" });
  archive.append(JSON.stringify(baseData.scraperRepos, null, 2), { name: "scraper-repos.json" });
  archive.append(JSON.stringify(baseData.scrapers, null, 2), { name: "scrapers.json" });
  archive.append(JSON.stringify(baseData.scraperRuns, null, 2), { name: "scraper-runs.json" });

  // Process events and media asynchronously, then finalize
  void (async () => {
    try {
      await addEventsAndMedia(archive, baseData);
      await archive.finalize();
    } catch (err) {
      fail(err);
    }
  })();
};

/** Stream the archive to `outputPath`, resolving with its final size. */
const writeArchive = (options: WriteArchiveOptions): Promise<ArchiveResult> => {
  const { outputPath } = options;

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    let failed = false;

    /**
     * Reject only once the write stream is fully closed.
     *
     * `createWriteStream` opens the file lazily, so rejecting immediately can
     * hand control back to the caller's unlink while the `open(2)` is still in
     * flight — the unlink then runs first and the open re-creates the partial
     * file. Destroying and waiting for 'close' makes the cleanup deterministic.
     */
    const fail = (err: unknown): void => {
      if (failed) return;
      failed = true;
      const error = err instanceof Error ? err : new Error(String(err));
      if (output.closed) {
        reject(error);
        return;
      }
      output.once("close", () => reject(error));
      output.destroy();
    };

    output.on("close", () => {
      if (failed) return;
      void (async () => {
        try {
          const stats = await stat(outputPath);
          resolve({ filePath: outputPath, fileSize: stats.size });
        } catch (err) {
          fail(err);
        }
      })();
    });

    archive.on("error", (err: Error) => fail(err));
    // Without this a disk-full/permission error on the write stream is an
    // unhandled 'error' event — crashing the worker or leaving the export
    // record stuck in "processing" forever.
    output.on("error", (err: Error) => fail(err));
    archive.pipe(output);

    // A synchronous throw here (e.g. JSON.stringify on an unserializable
    // record) would otherwise reject the Promise directly, skipping `fail` and
    // leaving the write stream open over a partial file.
    try {
      appendCollections(archive, options, fail);
    } catch (err) {
      fail(err);
    }
  });
};

/**
 * Write an export archive, deleting the partial file if anything fails.
 *
 * The write stream is opened before any data is produced, so a mid-archive
 * failure leaves a partial ZIP of the user's personal data at `outputPath`. The
 * export record is then marked "failed" with `filePath` never set, so neither
 * the cleanup job nor the account-deletion unlink path can ever find that file
 * — it must be deleted here or it is orphaned forever.
 */
export const buildExportArchive = async (
  options: WriteArchiveOptions & { exportId: number }
): Promise<ArchiveResult> => {
  const { exportId, outputPath } = options;
  try {
    return await writeArchive(options);
  } catch (error) {
    try {
      await unlink(outputPath);
      logger.warn({ exportId, outputPath }, "Deleted partial export archive after failure");
    } catch (unlinkError) {
      logger.error({ exportId, outputPath, error: unlinkError }, "Could not delete partial export archive");
    }
    throw error;
  }
};
