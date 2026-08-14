/**
 * Background job that synchronizes a scraper-repo's manifest with the scrapers collection.
 *
 * For git-sourced repos the job performs a shallow clone, reads `scrapers.yml`,
 * parses it via the manifest parser, then upserts/deletes scraper records so the
 * database matches the manifest. For upload-sourced repos it reads the manifest
 * from the inline `code` JSON field.
 *
 * @module
 * @category Jobs
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { SCRAPER_MAX_REPO_SIZE_MB } from "@timetiles/shared";
import type { Payload } from "payload";

import type { ParsedScraper } from "@/lib/ingest/manifest-parser";
import { parseManifest } from "@/lib/ingest/manifest-parser";
import { createLogger, logError } from "@/lib/logger";
import { hasUrlEmbeddedCredentials, isPrivateUrl, validateResolvedPublicHostname } from "@/lib/security/url-validation";
import { asSystem } from "@/lib/services/system-payload";
import { extractRelationId } from "@/lib/utils/relation-id";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { Scraper } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";

const logger = createLogger("scraper-repo-sync");

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Shallow-clone a git repo into a temporary directory.
 * Returns the path to the cloned directory.
 */
const validateGitCloneUrl = async (gitUrl: string): Promise<URL> => {
  let parsed: URL;

  try {
    parsed = new URL(gitUrl);
  } catch {
    throw new Error("Please provide a valid HTTPS Git URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS git URLs are allowed");
  }

  if (hasUrlEmbeddedCredentials(parsed)) {
    throw new Error("Git URLs must not include embedded credentials");
  }

  if (isPrivateUrl(parsed.toString())) {
    throw new Error("Git URLs pointing to private or internal networks are not allowed");
  }

  await validateResolvedPublicHostname(parsed.hostname);
  return parsed;
};

/**
 * Reject an oversized clone, the way the runner does.
 *
 * This clone runs on the WEB host just to read `scrapers.yml`, and the repo URL
 * comes from a trust-level-3 user — without the cap a single huge blob in the tip
 * commit (which `--depth 1` does not limit) fills the app server's temp space.
 */
const assertRepoWithinSizeLimit = async (repoDir: string): Promise<void> => {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "count-objects", "-v"], { timeout: 30_000 });
  const sizeMatch = /size-pack:\s+(\d+)/.exec(stdout);
  const sizeMb = sizeMatch?.[1] != null ? Number(sizeMatch[1]) / 1024 : 0;

  if (sizeMb > SCRAPER_MAX_REPO_SIZE_MB) {
    throw new Error(`Repository size (${sizeMb.toFixed(1)}MB) exceeds the ${SCRAPER_MAX_REPO_SIZE_MB}MB limit`);
  }
};

/**
 * Cap for `scrapers.yml` itself, in MB.
 *
 * A manifest is a short list of scraper definitions; the parser holds the whole
 * file in memory as a string and hands it to the YAML parser.
 */
const SCRAPER_MAX_MANIFEST_SIZE_MB = 2;

const MANIFEST_FILE = "scrapers.yml";

const manifestTooLarge = (sizeBytes: number): Error =>
  new Error(
    `Manifest ${MANIFEST_FILE} (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB) exceeds the ${SCRAPER_MAX_MANIFEST_SIZE_MB}MB limit`
  );

/**
 * Reject an oversized manifest before its blob is fetched.
 *
 * The repo cap only bounds the pack, and on a server that supports partial clone
 * the pack is tiny precisely because the blobs were left behind — the sparse
 * checkout then fetches `scrapers.yml` no matter how large it is. `ls-tree -l`
 * reads the size out of the tree object, which the filtered clone already has,
 * so this costs nothing and does not pull the blob down.
 */
const assertManifestBlobWithinSizeLimit = async (repoDir: string): Promise<void> => {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "ls-tree", "-l", "HEAD", "--", MANIFEST_FILE], {
    timeout: 30_000,
  });

  // Size is "-" for anything that is not a blob, and the output is empty when the
  // repo has no manifest — neither is this check's business.
  const sizeMatch = /^\d+\s+blob\s+\S+\s+(\d+)\s/m.exec(stdout);
  if (sizeMatch?.[1] == null) return;

  const sizeBytes = Number(sizeMatch[1]);
  if (sizeBytes > SCRAPER_MAX_MANIFEST_SIZE_MB * 1024 * 1024) {
    throw manifestTooLarge(sizeBytes);
  }
};

/** Materialize only the manifest from a --no-checkout clone. */
const checkoutManifestOnly = async (repoDir: string): Promise<void> => {
  await execFileAsync("git", ["-C", repoDir, "sparse-checkout", "set", "--no-cone", "scrapers.yml"], {
    timeout: 30_000,
  });
  await execFileAsync("git", ["-C", repoDir, "checkout"], { timeout: 60_000 });
};

const cloneRepo = async (gitUrl: string, branch: string | undefined): Promise<string> => {
  const parsedGitUrl = await validateGitCloneUrl(gitUrl);
  const tempDir = await mkdtemp(path.join(tmpdir(), "scraper-repo-"));

  logger.info("Cloning scraper repo", { gitUrl: sanitizeUrlForLogging(parsedGitUrl.toString()), branch, tempDir });

  try {
    // Disable Git HTTP redirects so the clone target cannot bounce to an
    // internal host after we validate the original URL.
    await execFileAsync(
      "git",
      [
        "-c",
        "http.followRedirects=false",
        "clone",
        "--depth",
        "1",
        // Only `scrapers.yml` is read here. blob:none + no-checkout keeps the huge
        // blobs on the server when it supports partial clone (older servers just
        // ignore the filter, which is why the size check below stays).
        "--filter=blob:none",
        "--no-checkout",
        // Empty/absent branch means "repository default branch" (matches the
        // runner and the field's documented fallback) — `--branch ""` makes
        // git fail with "Remote branch  not found", permanently breaking sync.
        ...(branch ? ["--branch", branch] : []),
        "--single-branch",
        parsedGitUrl.toString(),
        tempDir,
      ],
      {
        timeout: 60_000, // 60 seconds
        env: {
          ...process.env,
          // Disable interactive prompts (password, SSH key, etc.)
          GIT_TERMINAL_PROMPT: "0",
        },
      }
    );
    await assertRepoWithinSizeLimit(tempDir);
    await assertManifestBlobWithinSizeLimit(tempDir);
    await checkoutManifestOnly(tempDir);
  } catch (error) {
    // The caller only sees the temp dir once the clone succeeds, so clean it
    // up here — otherwise every failed sync (bad URL/branch/auth) leaks a dir.
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return tempDir;
};

/**
 * Read the manifest YAML from a cloned repo directory.
 *
 * The on-disk size is checked again rather than trusted from the tree: a server
 * that ignores the blob filter, a checkout that follows a different revision, or
 * a manifest recorded as something other than a blob all reach `readFile` without
 * having passed `assertManifestBlobWithinSizeLimit`.
 */
const readManifestFromDisk = async (repoDir: string): Promise<string> => {
  const manifestPath = path.join(repoDir, MANIFEST_FILE);

  const { size } = await stat(manifestPath);
  if (size > SCRAPER_MAX_MANIFEST_SIZE_MB * 1024 * 1024) {
    throw manifestTooLarge(size);
  }

  return readFile(manifestPath, "utf-8");
};

/**
 * Read the manifest YAML from an upload-sourced repo's inline code field.
 */
const readManifestFromCode = (code: Record<string, string>): string | null => code["scrapers.yml"] ?? null;

/**
 * Safely remove a temporary directory, logging but not throwing on failure.
 */
const cleanupTempDir = async (tempDir: string): Promise<void> => {
  try {
    await rm(tempDir, { recursive: true, force: true });
    logger.info("Cleaned up temp directory", { tempDir });
  } catch (error) {
    logError(error, "Failed to clean up temp directory", { tempDir });
  }
};

// ---------------------------------------------------------------------------
// Scraper upsert / delete logic
// ---------------------------------------------------------------------------

interface UpsertResult {
  created: number;
  updated: number;
  deleted: number;
}

/**
 * Synchronize scrapers collection to match the parsed manifest.
 *
 * - Creates new scrapers that exist in the manifest but not in the DB.
 * - Updates existing scrapers whose properties have changed.
 * - Deletes scrapers in the DB that are no longer in the manifest.
 */
/**
 * Is this the scrapers beforeDelete hook refusing to remove a running scraper?
 *
 * Matched on status rather than instanceof: the hook throws Payload's `APIError`
 * with 409, and Payload re-wraps errors as they cross the delete boundary, so
 * the concrete class is not something this caller can rely on.
 */
const isScraperRunningConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 409;

const syncScrapers = async (
  payload: Payload,
  repoId: number,
  repoCreatedBy: number | null,
  parsed: ParsedScraper[]
): Promise<UpsertResult> => {
  const result: UpsertResult = { created: 0, updated: 0, deleted: 0 };

  // Fetch existing scrapers for this repo
  const existing = await asSystem(payload).find({
    collection: "scrapers",
    where: { repo: { equals: repoId } },
    limit: 500,
  });

  const existingBySlug = new Map<string, Scraper>();
  for (const doc of existing.docs) {
    existingBySlug.set(doc.slug, doc);
  }

  const manifestSlugs = new Set(parsed.map((s) => s.slug));

  // Upsert scrapers from manifest
  for (const scraper of parsed) {
    const existingDoc = existingBySlug.get(scraper.slug);

    const data = {
      name: scraper.name,
      slug: scraper.slug,
      repo: repoId,
      // null, never undefined: Payload drops undefined from an update, so a repo
      // whose owner was cleared would leave the old owner on every scraper.
      repoCreatedBy,
      runtime: scraper.runtime,
      entrypoint: scraper.entrypoint,
      outputFile: scraper.output,
      schedule: scraper.schedule ?? null,
      timeoutSecs: scraper.limits.timeout,
      memoryMb: scraper.limits.memory,
    };

    if (existingDoc) {
      // A changed cron must take effect now: nextRunAt (once set) gates
      // shouldScraperRunNow with absolute precedence, so a stale value from
      // the OLD schedule would defer the new cadence until the old fire time.
      const scheduleChanged = (existingDoc.schedule ?? null) !== (scraper.schedule ?? null);
      await asSystem(payload).update({
        collection: "scrapers",
        id: existingDoc.id,
        data: scheduleChanged ? { ...data, nextRunAt: null } : data,
      });
      result.updated++;
      logger.info("Updated scraper", { slug: scraper.slug, id: existingDoc.id, scheduleChanged });
    } else {
      await asSystem(payload).create({ collection: "scrapers", data: { ...data, enabled: true } });
      result.created++;
      logger.info("Created scraper", { slug: scraper.slug });
    }
  }

  // Delete scrapers no longer in manifest.
  //
  // The runs are NOT deleted here. The scrapers beforeDelete hook cascades them
  // itself, and — crucially — it does so AFTER assertScraperNotRunning. Deleting
  // them up front inverted that order: a scraper that was mid-run had its entire
  // run history destroyed and only then hit the 409 that refused the delete, so
  // the sync both lost data and failed.
  //
  // A refusal is also per-scraper, not fatal to the sync. One scraper running
  // while its manifest entry disappears must not abort the whole job (which
  // would roll back or skip every remaining create/update); it is left in place
  // and picked up by the next sync once the run finishes.
  for (const [slug, doc] of existingBySlug) {
    if (manifestSlugs.has(slug)) continue;

    try {
      await asSystem(payload).delete({ collection: "scrapers", id: doc.id });
      result.deleted++;
      logger.info("Deleted scraper no longer in manifest", { slug, id: doc.id });
    } catch (error) {
      if (isScraperRunningConflict(error)) {
        logger.warn("Scraper no longer in manifest is running; deferring delete to the next sync", {
          slug,
          id: doc.id,
        });
        continue;
      }
      throw error;
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// Job handler
// ---------------------------------------------------------------------------

export const scraperRepoSyncJob = {
  slug: "scraper-repo-sync",
  retries: 2,
  // Serialize per repo AND coalesce rapid re-triggers. `exclusive` (default):
  // the slug upsert is find-then-create, so two parallel syncs (afterChange
  // auto-sync + manual force-sync) could both miss the existing slug and create
  // duplicate scrapers. `supersedes`: when a new sync is queued, Payload deletes
  // any older PENDING (not-yet-running) sync for the same repo — so a burst of
  // source edits collapses to a single follow-up that reads the LATEST state,
  // without a manual dedup check (which had a check-then-queue race). The
  // running sync is untouched; the superseding one runs after it.
  concurrency: {
    key: ({ input }: { input: { scraperRepoId: number } }) => `scraper-repo-sync:${input.scraperRepoId}`,
    supersedes: true,
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as { scraperRepoId: number };
    const { scraperRepoId } = input;

    logger.info("Starting scraper repo sync", { scraperRepoId });

    let tempDir: string | null = null;

    try {
      // 1. Load the scraper-repo record
      const repo = await asSystem(payload).findByID({ collection: "scraper-repos", id: scraperRepoId });

      if (!repo) {
        throw new Error(`Scraper repo not found: ${scraperRepoId}`);
      }

      // 2. Read the manifest based on source type
      let yamlContent: string;

      if (repo.sourceType === "git") {
        if (!repo.gitUrl) {
          throw new Error("Git URL is required for git source type");
        }

        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty branch string must coerce to undefined (clone default branch)
        const branch = repo.gitBranch || undefined;
        tempDir = await cloneRepo(repo.gitUrl, branch);
        yamlContent = await readManifestFromDisk(tempDir);
      } else {
        // Upload source type — read from inline code
        const code = repo.code as Record<string, string> | null;
        if (!code) {
          throw new Error("No inline code found for upload source type");
        }

        const manifest = readManifestFromCode(code);
        if (!manifest) {
          throw new Error("No scrapers.yml found in uploaded code");
        }

        yamlContent = manifest;
      }

      // 3. Parse and validate the manifest
      const parseResult = parseManifest(yamlContent);

      if (!parseResult.success) {
        throw new Error(parseResult.error);
      }

      // 4. Upsert scrapers
      const repoCreatedBy = extractRelationId<number>(repo.createdBy) ?? null;
      const syncResult = await syncScrapers(payload, scraperRepoId, repoCreatedBy, parseResult.scrapers);

      // 5. Update repo sync status
      await asSystem(payload).update({
        collection: "scraper-repos",
        id: scraperRepoId,
        data: { lastSyncAt: new Date().toISOString(), lastSyncStatus: "success", lastSyncError: "" },
      });

      logger.info("Scraper repo sync completed", { scraperRepoId, ...syncResult });

      return { output: { success: true, ...syncResult } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(error, "Scraper repo sync failed", { scraperRepoId });

      // Update repo sync status to failed
      try {
        await asSystem(payload).update({
          collection: "scraper-repos",
          id: scraperRepoId,
          data: { lastSyncAt: new Date().toISOString(), lastSyncStatus: "failed", lastSyncError: message },
        });
      } catch (updateError) {
        logError(updateError, "Failed to update repo sync status", { scraperRepoId });
      }

      throw error;
    } finally {
      // 6. Clean up temp dir
      if (tempDir) {
        await cleanupTempDir(tempDir);
      }
    }
  },
};
