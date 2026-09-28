/**
 * Environment configuration for the TimeScrape runner.
 *
 * @module
 * @category Config
 */

import { isAbsolute } from "node:path";

import {
  SCRAPER_MAX_REPO_SIZE_MB,
  SCRAPER_MEMORY_DEFAULT_MB,
  SCRAPER_MEMORY_MAX_MB,
  SCRAPER_MEMORY_MIN_MB,
  SCRAPER_TIMEOUT_DEFAULT_SECONDS,
  SCRAPER_TIMEOUT_MAX_SECONDS,
  SCRAPER_TIMEOUT_MIN_SECONDS,
} from "@timetiles/shared";
import { z } from "zod";

// `z.coerce.number()` reads an empty variable as 0, so every count must be positive to be usable.
const positiveInt = () => z.coerce.number().int().positive();

const envSchema = z.object({
  SCRAPER_API_KEY: z.string().min(16, "API key must be at least 16 characters"),
  SCRAPER_PORT: positiveInt().max(65_535).default(4000),
  SCRAPER_MAX_CONCURRENT: positiveInt().default(3),
  SCRAPER_DEFAULT_TIMEOUT: positiveInt()
    .min(SCRAPER_TIMEOUT_MIN_SECONDS)
    .max(SCRAPER_TIMEOUT_MAX_SECONDS)
    .default(SCRAPER_TIMEOUT_DEFAULT_SECONDS),
  SCRAPER_DEFAULT_MEMORY: positiveInt()
    .min(SCRAPER_MEMORY_MIN_MB)
    .max(SCRAPER_MEMORY_MAX_MB)
    .default(SCRAPER_MEMORY_DEFAULT_MB),
  SCRAPER_MAX_REPO_SIZE_MB: z.coerce.number().positive().default(SCRAPER_MAX_REPO_SIZE_MB),
  // Idle (block) timeout in ms for git operations. Kills a stalled/trickling
  // git process so a malicious or unresponsive server cannot hold a concurrency
  // slot indefinitely.
  SCRAPER_GIT_CLONE_TIMEOUT: positiveInt().default(60_000),
  // Output is served via file download endpoint. Keep conservative for disk usage.
  SCRAPER_MAX_OUTPUT_SIZE_MB: z.coerce.number().positive().default(50),
  // Files and directories a run may create under its output mount; empty files evade the size cap.
  SCRAPER_MAX_OUTPUT_ENTRIES: positiveInt().default(10_000),
  // Downloadable outputs older than this are swept; the web app's DELETE is best-effort.
  SCRAPER_OUTPUT_TTL_HOURS: z.coerce.number().positive().default(24),
  // Set by whatever launches the runner, next to the write access it grants.
  // Absolute because podman reads a relative mount source as a volume name.
  SCRAPER_DATA_DIR: z.string().refine(isAbsolute, "must be an absolute path"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export const loadConfig = (): Config => {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
};

export const getConfig = (): Config => {
  if (!_config) return loadConfig();
  return _config;
};
