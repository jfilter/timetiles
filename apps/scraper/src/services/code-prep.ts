/**
 * Prepare scraper code for container execution.
 * Handles both Git repos and inline code uploads.
 *
 * @module
 * @category Services
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { simpleGit } from "simple-git";

import { getConfig } from "../config.js";
import { RunnerError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { RunRequest } from "../types.js";

export async function prepareCode(request: RunRequest, codeDir: string): Promise<void> {
  if (request.code_url) {
    await cloneRepo(request.code_url, codeDir);
  } else if (request.code) {
    await writeInlineCode(request.code, codeDir);
  } else {
    throw new RunnerError("Either code_url or code must be provided", "INVALID_REQUEST", 400);
  }
}

async function cloneRepo(codeUrl: string, codeDir: string): Promise<void> {
  // Parse URL: "https://github.com/user/repo.git#branch"
  const [url, branch] = codeUrl.split("#");

  if (!url) {
    throw new RunnerError("Invalid code_url", "INVALID_REQUEST", 400);
  }

  const config = getConfig();
  const git = simpleGit();

  logger.info({ url, branch: branch ?? "default" }, "Cloning repository");

  try {
    const cloneArgs = ["--depth", "1", "--single-branch"];
    if (branch) {
      cloneArgs.push("--branch", branch);
    }

    await git.clone(url, codeDir, cloneArgs);

    // Check repo size
    const stdout = await git.cwd(codeDir).raw(["count-objects", "-vH"]);
    const sizeMatch = stdout.match(/size-pack:\s+(\d+)/);
    const sizeMb = sizeMatch ? Number(sizeMatch[1]) / (1024 * 1024) : 0;

    if (sizeMb > config.SCRAPER_MAX_REPO_SIZE_MB) {
      throw new RunnerError(
        `Repository size (${sizeMb.toFixed(1)}MB) exceeds limit (${config.SCRAPER_MAX_REPO_SIZE_MB}MB)`,
        "REPO_TOO_LARGE",
        413
      );
    }
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(
      `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
      "GIT_CLONE_FAILED",
      500
    );
  }
}

async function writeInlineCode(code: Record<string, string>, codeDir: string): Promise<void> {
  logger.info({ fileCount: Object.keys(code).length }, "Writing inline code");

  for (const [filename, content] of Object.entries(code)) {
    // Prevent path traversal
    if (filename.includes("..") || filename.startsWith("/")) {
      throw new RunnerError(`Invalid filename: ${filename}`, "INVALID_REQUEST", 400);
    }

    const filePath = join(codeDir, filename);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }
}
