/**
 * The scraper run contract between the web app and the TimeScrape runner.
 *
 * Holds the wire types, the runtime/status tuples and the resource-limit
 * bounds. Dependency-free on purpose: the app-local Zod schemas are built from
 * these values so acceptance rules cannot drift between the two apps.
 *
 * @module
 * @category Types
 */

/** Container runtimes a scraper can request. */
export const SCRAPER_RUNTIMES = ["python", "node"] as const;

export type ScraperRuntime = (typeof SCRAPER_RUNTIMES)[number];

/** Terminal states the runner reports for a run. */
export const SCRAPER_RUN_STATUSES = ["success", "failed", "timeout"] as const;

export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number];

/** Resource limit bounds and defaults, shared by manifest, admin UI and runner. */
export const SCRAPER_TIMEOUT_MIN_SECONDS = 10;
export const SCRAPER_TIMEOUT_MAX_SECONDS = 3600;
export const SCRAPER_TIMEOUT_DEFAULT_SECONDS = 300;

export const SCRAPER_MEMORY_MIN_MB = 64;
export const SCRAPER_MEMORY_MAX_MB = 4096;
export const SCRAPER_MEMORY_DEFAULT_MB = 512;

/**
 * Cap for a cloned scraper repository, in MB.
 *
 * The runner enforces it via SCRAPER_MAX_REPO_SIZE_MB; the web app clones the
 * same repositories on its own host to read the manifest and must not be the
 * softer of the two.
 */
export const SCRAPER_MAX_REPO_SIZE_MB = 50;

/** Output filename used when a scraper does not configure one. */
export const SCRAPER_DEFAULT_OUTPUT_FILE = "data.csv";

/** Resource limits as sent on the wire (snake_case). */
export interface ScraperRunLimits {
  timeout_secs?: number;
  memory_mb?: number;
}

/** POST /run request body. */
export interface ScraperRunRequest {
  run_id: string;
  runtime: ScraperRuntime;
  entrypoint: string;
  output_file?: string;
  code_url?: string;
  code?: Record<string, string>;
  env?: Record<string, string>;
  limits?: ScraperRunLimits;
}

/** POST /run response body. */
export interface ScraperRunResult {
  status: ScraperRunStatus;
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  output?: { rows: number; bytes: number; download_url: string };
}
