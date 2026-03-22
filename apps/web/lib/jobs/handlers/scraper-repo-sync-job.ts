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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { Payload } from "payload";

import type { ParsedScraper } from "@/lib/ingest/manifest-parser";
import { parseManifest } from "@/lib/ingest/manifest-parser";
import { createLogger, logError } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
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
const cloneRepo = async (gitUrl: string, branch: string): Promise<string> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "scraper-repo-"));

  logger.info("Cloning scraper repo", { gitUrl, branch, tempDir });

  await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, "--single-branch", gitUrl, tempDir], {
    timeout: 60_000, // 60 seconds
    env: {
      ...process.env,
      // Disable interactive prompts (password, SSH key, etc.)
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  return tempDir;
};

/**
 * Read the manifest YAML from a cloned repo directory.
 */
const readManifestFromDisk = async (repoDir: string): Promise<string> => {
  const manifestPath = path.join(repoDir, "scrapers.yml");
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
const syncScrapers = async (
  payload: Payload,
  repoId: number,
  repoCreatedBy: number | undefined,
  parsed: ParsedScraper[]
): Promise<UpsertResult> => {
  const result: UpsertResult = { created: 0, updated: 0, deleted: 0 };

  // Fetch existing scrapers for this repo
  const existing = await payload.find({
    collection: "scrapers",
    where: { repo: { equals: repoId } },
    limit: 500,
    overrideAccess: true,
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
      repoCreatedBy: repoCreatedBy ?? undefined,
      runtime: scraper.runtime,
      entrypoint: scraper.entrypoint,
      outputFile: scraper.output,
      schedule: scraper.schedule ?? null,
      timeoutSecs: scraper.limits.timeout,
      memoryMb: scraper.limits.memory,
    };

    if (existingDoc) {
      await payload.update({ collection: "scrapers", id: existingDoc.id, data, overrideAccess: true });
      result.updated++;
      logger.info("Updated scraper", { slug: scraper.slug, id: existingDoc.id });
    } else {
      await payload.create({ collection: "scrapers", data: { ...data, enabled: true }, overrideAccess: true });
      result.created++;
      logger.info("Created scraper", { slug: scraper.slug });
    }
  }

  // Delete scrapers no longer in manifest (and their associated runs)
  for (const [slug, doc] of existingBySlug) {
    if (!manifestSlugs.has(slug)) {
      await payload.delete({
        collection: "scraper-runs",
        where: { scraper: { equals: doc.id } },
        overrideAccess: true,
      });
      await payload.delete({ collection: "scrapers", id: doc.id, overrideAccess: true });
      result.deleted++;
      logger.info("Deleted scraper no longer in manifest", { slug, id: doc.id });
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
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as { scraperRepoId: number };
    const { scraperRepoId } = input;

    logger.info("Starting scraper repo sync", { scraperRepoId });

    let tempDir: string | null = null;

    try {
      // 1. Load the scraper-repo record
      const repo = await payload.findByID({ collection: "scraper-repos", id: scraperRepoId, overrideAccess: true });

      if (!repo) {
        throw new Error(`Scraper repo not found: ${scraperRepoId}`);
      }

      // 2. Read the manifest based on source type
      let yamlContent: string;

      if (repo.sourceType === "git") {
        if (!repo.gitUrl) {
          throw new Error("Git URL is required for git source type");
        }

        const branch = repo.gitBranch ?? "main";
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
      const repoCreatedBy = extractRelationId(repo.createdBy);
      const syncResult = await syncScrapers(payload, scraperRepoId, repoCreatedBy, parseResult.scrapers);

      // 5. Update repo sync status
      await payload.update({
        collection: "scraper-repos",
        id: scraperRepoId,
        data: { lastSyncAt: new Date().toISOString(), lastSyncStatus: "success", lastSyncError: "" },
        overrideAccess: true,
      });

      logger.info("Scraper repo sync completed", { scraperRepoId, ...syncResult });

      return { output: { success: true, ...syncResult } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(error, "Scraper repo sync failed", { scraperRepoId });

      // Update repo sync status to failed
      try {
        await payload.update({
          collection: "scraper-repos",
          id: scraperRepoId,
          data: { lastSyncAt: new Date().toISOString(), lastSyncStatus: "failed", lastSyncError: message },
          overrideAccess: true,
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
