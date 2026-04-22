// @vitest-environment node
/**
 * Unit tests for the preview-cleanup maintenance job and the underlying
 * `sweepExpiredPreviews` helper in the preview store.
 *
 * Covers the L2 fix: preview temp files were only cleaned when a caller
 * invoked `cleanupPreview` — aborted/abandoned wizards leaked files on disk.
 * The sweep removes entries whose metadata `createdAt` is older than
 * PREVIEW_EXPIRY_MS, and cleans up orphaned data files.
 *
 * Uses an isolated temp directory per test so parallel test files writing
 * to `timetiles-wizard-preview` cannot interfere.
 *
 * @module
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPreviewDirPath, PREVIEW_EXPIRY_MS, sweepExpiredPreviews } from "@/lib/ingest/preview-store";
import { previewCleanupJob } from "@/lib/jobs/handlers/preview-cleanup-job";

const uuid = (suffix: string): string => `aaaaaaaa-aaaa-4aaa-8aaa-${suffix.padStart(12, "0")}`;

let testDir = "";

const writeMeta = (previewId: string, createdAt: Date): void => {
  fs.writeFileSync(
    path.join(testDir, `${previewId}.meta.json`),
    JSON.stringify({
      previewId,
      userId: 1,
      originalName: "test.csv",
      filePath: path.join(testDir, `${previewId}.csv`),
      mimeType: "text/csv",
      fileSize: 10,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + PREVIEW_EXPIRY_MS).toISOString(),
    })
  );
};

const writeData = (previewId: string, ext = ".csv"): void => {
  fs.writeFileSync(path.join(testDir, `${previewId}${ext}`), "title,date\n");
};

describe.sequential("sweepExpiredPreviews", () => {
  beforeEach(() => {
    // Each test gets its own isolated temp directory to avoid collisions with
    // other tests (the default preview dir is shared across many tests that
    // run in parallel).
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "timetiles-preview-cleanup-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("exposes getPreviewDirPath() pointing inside os.tmpdir()", () => {
    expect(getPreviewDirPath()).toBe(path.join(os.tmpdir(), "timetiles-wizard-preview"));
  });

  it("removes metadata + data file pairs older than PREVIEW_EXPIRY_MS", () => {
    const id = uuid("1");
    writeMeta(id, new Date(Date.now() - 2 * PREVIEW_EXPIRY_MS));
    writeData(id);

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.removed).toBe(1);
    expect(fs.existsSync(path.join(testDir, `${id}.meta.json`))).toBe(false);
    expect(fs.existsSync(path.join(testDir, `${id}.csv`))).toBe(false);
  });

  it("keeps entries younger than PREVIEW_EXPIRY_MS", () => {
    const id = uuid("2");
    // Created 5 minutes ago — well within 1-hour TTL
    writeMeta(id, new Date(Date.now() - 5 * 60 * 1000));
    writeData(id);

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.scanned).toBe(1);
    expect(result.removed).toBe(0);
    expect(fs.existsSync(path.join(testDir, `${id}.meta.json`))).toBe(true);
    expect(fs.existsSync(path.join(testDir, `${id}.csv`))).toBe(true);
  });

  it("removes orphan data files with no companion meta.json", () => {
    const id = uuid("3");
    writeData(id);

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.orphanedRemoved).toBe(1);
    expect(fs.existsSync(path.join(testDir, `${id}.csv`))).toBe(false);
  });

  it("ignores unrelated files that don't match the preview id shape", () => {
    fs.writeFileSync(path.join(testDir, "unrelated-file.txt"), "hi");

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.orphanedRemoved).toBe(0);
    expect(fs.existsSync(path.join(testDir, "unrelated-file.txt"))).toBe(true);
  });

  it("treats metadata with missing/unparseable createdAt as expired", () => {
    const id = uuid("4");
    const metaPath = path.join(testDir, `${id}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ previewId: id })); // no createdAt
    writeData(id);

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.removed).toBe(1);
    expect(fs.existsSync(metaPath)).toBe(false);
  });

  it("handles multiple entries mixed: keeps fresh, removes stale, cleans orphans", () => {
    const fresh = uuid("a");
    const stale = uuid("b");
    const orphan = uuid("c");

    writeMeta(fresh, new Date());
    writeData(fresh);

    writeMeta(stale, new Date(Date.now() - 2 * PREVIEW_EXPIRY_MS));
    writeData(stale);

    writeData(orphan);

    const result = sweepExpiredPreviews(new Date(), testDir);

    expect(result.scanned).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.orphanedRemoved).toBe(1);
    expect(fs.existsSync(path.join(testDir, `${fresh}.meta.json`))).toBe(true);
    expect(fs.existsSync(path.join(testDir, `${stale}.meta.json`))).toBe(false);
    expect(fs.existsSync(path.join(testDir, `${orphan}.csv`))).toBe(false);
  });

  it("returns zero counts when the preview directory does not exist", () => {
    const missingDir = path.join(testDir, "does-not-exist");

    const result = sweepExpiredPreviews(new Date(), missingDir);

    expect(result).toEqual({ scanned: 0, removed: 0, orphanedRemoved: 0, errors: 0 });
  });
});

describe.sequential("previewCleanupJob", () => {
  it("is scheduled on the maintenance queue every 6 hours", () => {
    expect(previewCleanupJob.slug).toBe("preview-cleanup");
    expect(previewCleanupJob.schedule[0]?.cron).toBe("0 */6 * * *");
    expect(previewCleanupJob.schedule[0]?.queue).toBe("maintenance");
  });
});
