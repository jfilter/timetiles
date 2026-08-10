/**
 * Entry point of the shared package — code shared between the TimeTiles apps.
 *
 * @module
 */
export { isPrivateIP, normalizeAddressLiteral } from "./private-ip.js";
export type {
  ScraperRunLimits,
  ScraperRunRequest,
  ScraperRunResult,
  ScraperRunStatus,
  ScraperRuntime,
} from "./scraper-contract.js";
export {
  SCRAPER_DEFAULT_OUTPUT_FILE,
  SCRAPER_MEMORY_DEFAULT_MB,
  SCRAPER_MEMORY_MAX_MB,
  SCRAPER_MEMORY_MIN_MB,
  SCRAPER_RUN_STATUSES,
  SCRAPER_RUNTIMES,
  SCRAPER_TIMEOUT_DEFAULT_SECONDS,
  SCRAPER_TIMEOUT_MAX_SECONDS,
  SCRAPER_TIMEOUT_MIN_SECONDS,
} from "./scraper-contract.js";
export { isPlainOutputFilename, isSafeRelativeEntrypoint } from "./scraper-paths.js";
