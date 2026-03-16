/**
 * Environment configuration for the TimeScrape runner.
 *
 * @module
 * @category Config
 */

import { z } from "zod";

const envSchema = z.object({
  SCRAPER_API_KEY: z.string().min(16, "API key must be at least 16 characters"),
  SCRAPER_PORT: z.coerce.number().default(4000),
  SCRAPER_MAX_CONCURRENT: z.coerce.number().default(3),
  SCRAPER_DEFAULT_TIMEOUT: z.coerce.number().default(300),
  SCRAPER_DEFAULT_MEMORY: z.coerce.number().default(512),
  SCRAPER_MAX_REPO_SIZE_MB: z.coerce.number().default(50),
  // Output is served via file download endpoint. Keep conservative for disk usage.
  SCRAPER_MAX_OUTPUT_SIZE_MB: z.coerce.number().default(50),
  SCRAPER_DATA_DIR: z.string().default("/tmp/timescrape"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}
