/**
 * Preview file storage for the import wizard.
 *
 * Centralises path creation, metadata load/save, cleanup, and ID validation
 * for wizard preview files. Both the preview-schema and configure routes
 * import from this module instead of duplicating storage logic.
 *
 * @module
 * @category Import
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { PreviewMetadata } from "@/lib/ingest/types/wizard";

/** Directory name inside os.tmpdir() where preview files are stored. */
const PREVIEW_DIR_NAME = "timetiles-wizard-preview";

/** How long a preview is valid (1 hour). */
export const PREVIEW_EXPIRY_MS = 60 * 60 * 1000;

/** UUID v4 format validation regex. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Known data file extensions that the preview may have created. */
const DATA_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx", ".ods"];

/**
 * Validate that a preview ID is a well-formed UUID v4.
 * Prevents path-traversal attacks when constructing file paths.
 */
export const isValidPreviewId = (id: string): boolean => UUID_REGEX.test(id);

/**
 * Resolve the preview temp directory path.
 */
const resolvePreviewDir = (): string => path.join(os.tmpdir(), PREVIEW_DIR_NAME);

/**
 * Public resolver for the preview temp directory — read-only, does not
 * create the directory. Used by the preview-cleanup maintenance job.
 */
export const getPreviewDirPath = (): string => resolvePreviewDir();

/**
 * Get (and lazily create) the preview temp directory.
 * Use this for write operations that need the directory to exist.
 */
export const getPreviewDir = (): string => {
  const previewDir = resolvePreviewDir();
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  return previewDir;
};

/** Options for {@link savePreviewMetadata}. */
export interface SavePreviewMetadataOpts {
  previewId: string;
  userId: number;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  sourceUrl?: string;
}

/**
 * Save preview metadata to disk.
 * Intentionally omits authConfig to avoid persisting secrets to disk.
 */
export const savePreviewMetadata = (opts: SavePreviewMetadataOpts): void => {
  const previewDir = getPreviewDir();
  const previewMetaPath = path.join(previewDir, `${opts.previewId}.meta.json`);
  fs.writeFileSync(
    previewMetaPath,
    JSON.stringify({
      previewId: opts.previewId,
      userId: opts.userId,
      originalName: opts.originalName,
      filePath: opts.filePath,
      mimeType: opts.mimeType,
      fileSize: opts.fileSize,
      sourceUrl: opts.sourceUrl,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PREVIEW_EXPIRY_MS).toISOString(),
    })
  );
};

/**
 * Load preview metadata from disk.
 * Returns null if the previewId is invalid, the file doesn't exist, or can't be parsed.
 */
export const loadPreviewMetadata = (previewId: string): PreviewMetadata | null => {
  if (!isValidPreviewId(previewId)) {
    return null;
  }

  const previewDir = resolvePreviewDir();
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(content) as PreviewMetadata;
  } catch {
    return null;
  }
};

/**
 * Remove preview metadata and any associated data files from disk.
 * Caller must have already validated the previewId.
 */
export const cleanupPreview = (previewId: string): void => {
  const previewDir = resolvePreviewDir();

  // Remove the metadata file
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);
  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }

  // Remove any associated data files
  for (const ext of DATA_FILE_EXTENSIONS) {
    const dataPath = path.join(previewDir, `${previewId}${ext}`);
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
  }
};

/** Result of a single preview-cleanup sweep. */
export interface PreviewCleanupResult {
  scanned: number;
  removed: number;
  orphanedRemoved: number;
  errors: number;
}

/** Parse a metadata file and decide whether it's expired relative to `now`. */
const readMetadataExpiry = (metaPath: string, now: Date): { expired: boolean } | { error: true } => {
  try {
    const raw = fs.readFileSync(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as { createdAt?: string };
    const createdAt = parsed?.createdAt ? new Date(parsed.createdAt).getTime() : 0;
    // Missing / unparseable createdAt is treated as stale.
    const expired = !Number.isFinite(createdAt) || now.getTime() - createdAt > PREVIEW_EXPIRY_MS;
    return { expired };
  } catch {
    return { error: true };
  }
};

/** Delete the metadata + every known data-file extension for a previewId. */
const removePreviewSet = (previewDir: string, previewId: string, metaPath: string, dataFileSet: Set<string>): void => {
  fs.unlinkSync(metaPath);
  for (const ext of DATA_FILE_EXTENSIONS) {
    const dataName = `${previewId}${ext}`;
    if (!dataFileSet.has(dataName)) continue;
    const dataPath = path.join(previewDir, dataName);
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    dataFileSet.delete(dataName);
  }
};

/** Claim every companion data file of a fresh metadata entry so orphan sweep skips them. */
const claimFreshDataFiles = (previewId: string, dataFileSet: Set<string>): void => {
  for (const ext of DATA_FILE_EXTENSIONS) {
    dataFileSet.delete(`${previewId}${ext}`);
  }
};

const PREVIEW_DATA_FILE_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\./i;

/**
 * Sweep the preview directory, removing any metadata + data-file pair whose
 * `createdAt` is older than {@link PREVIEW_EXPIRY_MS}. Also removes any data
 * files whose companion `.meta.json` is missing (treated as orphans).
 *
 * Non-throwing: collects error counts instead of aborting the sweep.
 *
 * @param now - Override "current time" for deterministic testing.
 * @param dirOverride - Optional directory override (for isolated testing).
 */
// eslint-disable-next-line sonarjs/no-invariant-returns -- Accumulator pattern: same object reference, different content
export const sweepExpiredPreviews = (now: Date = new Date(), dirOverride?: string): PreviewCleanupResult => {
  const result: PreviewCleanupResult = { scanned: 0, removed: 0, orphanedRemoved: 0, errors: 0 };
  const previewDir = dirOverride ?? resolvePreviewDir();

  if (!fs.existsSync(previewDir)) return result;

  let entries: string[];
  try {
    entries = fs.readdirSync(previewDir);
  } catch {
    result.errors++;
    return result;
  }

  const metaFiles = entries.filter((f) => f.endsWith(".meta.json"));
  const dataFileSet = new Set(entries.filter((f) => !f.endsWith(".meta.json")));

  for (const metaFile of metaFiles) {
    result.scanned++;
    const previewId = metaFile.replace(/\.meta\.json$/, "");
    const metaPath = path.join(previewDir, metaFile);

    const expiryResult = readMetadataExpiry(metaPath, now);
    if ("error" in expiryResult) {
      result.errors++;
      continue;
    }

    if (!expiryResult.expired) {
      claimFreshDataFiles(previewId, dataFileSet);
      continue;
    }

    try {
      removePreviewSet(previewDir, previewId, metaPath, dataFileSet);
      result.removed++;
    } catch {
      result.errors++;
    }
  }

  // Remove orphaned data files (no matching .meta.json).
  for (const orphan of dataFileSet) {
    if (!PREVIEW_DATA_FILE_NAME_RE.test(orphan)) continue;
    try {
      fs.unlinkSync(path.join(previewDir, orphan));
      result.orphanedRemoved++;
    } catch {
      result.errors++;
    }
  }

  return result;
};
