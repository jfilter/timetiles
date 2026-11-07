/**
 * Prepare scraper code for container execution.
 * Handles both Git repos and inline code uploads.
 *
 * @module
 * @category Services
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isSafeRelativeEntrypoint, SCRAPER_CLONE_DEADLINE_SECONDS } from "@timetiles/shared";
import { simpleGit } from "simple-git";

import { getConfig } from "../config.js";
import { RunnerError } from "../lib/errors.js";
import { startGitEgressProxy } from "../lib/git-egress-proxy.js";
import { logger } from "../lib/logger.js";
import { resolvePublicGitTarget } from "../lib/ssrf-guard.js";
import type { RunRequest } from "../types.js";

export const prepareCode = async (request: RunRequest, codeDir: string): Promise<void> => {
  if (request.code_url) {
    await cloneRepo(request.code_url, codeDir);
  } else if (request.code) {
    await writeInlineCode(request.code, codeDir);
  } else {
    throw new RunnerError("Either code_url or code must be provided", "INVALID_REQUEST", 400);
  }
};

const cloneRepo = async (codeUrl: string, codeDir: string): Promise<void> => {
  // Parse URL: "https://github.com/user/repo.git#branch"
  const [url, branch] = codeUrl.split("#");

  if (!url) {
    throw new RunnerError("Invalid code_url", "INVALID_REQUEST", 400);
  }

  const config = getConfig();
  const maxBytes = config.SCRAPER_MAX_REPO_SIZE_MB * 1024 * 1024;

  logger.info({ url, branch: branch ?? "default" }, "Cloning repository");

  // The web side only validated the hostname pattern; resolve it here and pin the clone to the answer.
  const addresses = await resolvePublicGitTarget(url);
  const { protocol, port } = new URL(url);
  const proxy = await startGitEgressProxy(
    { addresses, port: Number(port) || (protocol === "https:" ? 443 : 80) },
    maxBytes
  );

  // The block timeout only catches silence; the deadline bounds a server that trickles progress forever.
  const deadline = AbortSignal.timeout(SCRAPER_CLONE_DEADLINE_SECONDS * 1000);
  // `config` entries become `-c key=value`. A redirect would reach a host the guard never saw,
  // and NO_PROXY in the environment would let git bypass the pinning proxy, so git gets PATH and HOME only.
  const git = simpleGit({
    timeout: { block: config.SCRAPER_GIT_CLONE_TIMEOUT },
    config: ["http.followRedirects=false", `http.proxy=${proxy.url}`],
    abort: deadline,
  }).env(gitEnvironment());

  try {
    const cloneArgs = ["--depth", "1", "--single-branch", "--no-checkout"];
    if (branch) {
      cloneArgs.push("--branch", branch);
    }

    try {
      await git.clone(url, codeDir, cloneArgs);
    } finally {
      await proxy.close();
    }

    // Blob sizes are the checkout's size; a small pack can inflate to far more on disk.
    const repo = git.cwd(codeDir);
    const sizeMb = sumBlobBytes(await repo.raw(["ls-tree", "-r", "-l", "-z", "HEAD"])) / (1024 * 1024);
    if (sizeMb > config.SCRAPER_MAX_REPO_SIZE_MB) {
      throw new RunnerError(
        `Repository size (${sizeMb.toFixed(1)}MB) exceeds limit (${config.SCRAPER_MAX_REPO_SIZE_MB}MB)`,
        "REPO_TOO_LARGE",
        413
      );
    }
    await repo.raw(["checkout", "HEAD", "--", "."]);
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    if (proxy.exceeded()) {
      throw new RunnerError(
        `Repository transfer exceeded the ${config.SCRAPER_MAX_REPO_SIZE_MB}MB limit`,
        "REPO_TOO_LARGE",
        413
      );
    }
    if (deadline.aborted) {
      throw new RunnerError(
        `Repository clone exceeded the ${SCRAPER_CLONE_DEADLINE_SECONDS}s deadline`,
        "GIT_CLONE_FAILED",
        500
      );
    }
    throw new RunnerError(
      `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
      "GIT_CLONE_FAILED",
      500
    );
  }
};

const gitEnvironment = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
};

/** Total blob size from `git ls-tree -r -l -z`; submodule entries carry no size. */
const sumBlobBytes = (listing: string): number => {
  let total = 0;
  for (const entry of listing.split("\0")) {
    const [, type, , size] = entry.split(/\s+/, 4);
    if (type !== "blob") continue;
    const bytes = Number(size);
    if (!Number.isSafeInteger(bytes)) {
      throw new RunnerError("Could not determine the cloned repository's size", "GIT_CLONE_FAILED", 500);
    }
    total += bytes;
  }
  return total;
};

const writeInlineCode = async (code: Record<string, string>, codeDir: string): Promise<void> => {
  logger.info({ fileCount: Object.keys(code).length }, "Writing inline code");

  for (const [filename, content] of Object.entries(code)) {
    // Same path rule the manifest entrypoint must satisfy on both sides.
    if (!isSafeRelativeEntrypoint(filename)) {
      throw new RunnerError(`Invalid filename: ${filename}`, "INVALID_REQUEST", 400);
    }

    const filePath = join(codeDir, filename);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    } catch (error) {
      // Colliding paths such as `lib` and `lib/x.py` are a malformed file map, not a runner fault.
      const reason = (error as NodeJS.ErrnoException).code ?? String(error);
      throw new RunnerError(`Cannot write inline file ${filename}: ${reason}`, "INVALID_REQUEST", 400);
    }
  }
};
