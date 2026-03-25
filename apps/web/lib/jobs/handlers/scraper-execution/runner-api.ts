/**
 * TimeScrape runner API interaction helpers.
 *
 * Types, request building, and HTTP communication with the external
 * runner service that executes scrapers in isolated containers.
 *
 * @module
 * @category Jobs
 */
import { getEnv } from "@/lib/config/env";
import type { Scraper, ScraperRepo } from "@/payload-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScraperExecutionJobInput {
  scraperId: number;
  triggeredBy: "schedule" | "manual" | "webhook";
}

export interface RunnerRequest {
  run_id: string;
  runtime: string;
  entrypoint: string;
  output_file: string;
  code_url?: string;
  code?: Record<string, string>;
  env: Record<string, string>;
  limits: { timeout_secs: number; memory_mb: number };
}

export interface RunnerResponse {
  status: "success" | "failed" | "timeout";
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  output?: { rows: number; bytes: number; download_url: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the code_url string for a git-based repo.
 * Format: "https://github.com/user/repo.git#branch"
 */
const buildCodeUrl = (repo: ScraperRepo): string | undefined => {
  if (repo.sourceType !== "git" || !repo.gitUrl) return undefined;
  const branch = repo.gitBranch ?? "main";
  return `${repo.gitUrl}#${branch}`;
};

/**
 * Build inline code map from a repo with uploaded code.
 */
const buildInlineCode = (repo: ScraperRepo): Record<string, string> | undefined => {
  if (repo.sourceType !== "upload" || !repo.code) return undefined;
  if (typeof repo.code === "object" && !Array.isArray(repo.code)) {
    return repo.code as Record<string, string>;
  }
  return undefined;
};

/**
 * Parse envVars from the scraper into a flat string->string map.
 */
export const parseEnvVars = (envVars: Scraper["envVars"]): Record<string, string> => {
  if (!envVars || typeof envVars !== "object" || Array.isArray(envVars)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    result[key] = String(value);
  }
  return result;
};

/**
 * Call the TimeScrape runner API.
 */
export const callRunner = async (request: RunnerRequest): Promise<RunnerResponse> => {
  const env = getEnv();
  const runnerUrl = env.SCRAPER_RUNNER_URL;
  const apiKey = env.SCRAPER_API_KEY;

  if (!runnerUrl) {
    throw new Error("SCRAPER_RUNNER_URL environment variable is not configured");
  }

  const baseUrl = runnerUrl.endsWith("/") ? runnerUrl.slice(0, -1) : runnerUrl;
  const url = `${baseUrl}/run`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const timeoutMs = ((request.limits?.timeout_secs ?? 300) + 60) * 1000;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runner API returned ${response.status}: ${body}`);
  }

  return (await response.json()) as RunnerResponse;
};

/**
 * Build the request object for the runner API (pure function).
 */
export const buildRunnerRequest = (scraper: Scraper, repo: ScraperRepo, runUuid: string): RunnerRequest => {
  const request: RunnerRequest = {
    run_id: runUuid,
    runtime: scraper.runtime,
    entrypoint: scraper.entrypoint,
    output_file: scraper.outputFile ?? "data.csv",
    env: parseEnvVars(scraper.envVars),
    limits: { timeout_secs: scraper.timeoutSecs ?? 300, memory_mb: scraper.memoryMb ?? 512 },
  };

  const codeUrl = buildCodeUrl(repo);
  if (codeUrl) {
    request.code_url = codeUrl;
  }

  const inlineCode = buildInlineCode(repo);
  if (inlineCode) {
    request.code = inlineCode;
  }

  return request;
};
