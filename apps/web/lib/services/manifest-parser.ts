/**
 * Parses and validates `scrapers.yml` manifest files from scraper repositories.
 *
 * Handles YAML parsing, Zod validation, default merging, and security checks
 * (path traversal, URL-safe slugs). Returns an array of fully-resolved scraper
 * configurations ready for upserting into the scrapers collection.
 *
 * @module
 * @category Services
 */
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { createLogger } from "@/lib/logger";

const logger = createLogger("manifest-parser");

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** URL-safe slug: lowercase alphanumeric, hyphens, max 128 chars. */
const slugSchema = z
  .string()
  .min(1, "Slug must not be empty")
  .max(128, "Slug must be 128 characters or fewer")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    "Slug must be URL-safe (lowercase letters, numbers, and hyphens only)"
  )
  .refine((v) => !v.includes("--"), "Slug must not contain consecutive hyphens");

const runtimeSchema = z.enum(["python", "node"]);

/** Entrypoint must not contain path traversal sequences. */
const entrypointSchema = z
  .string()
  .min(1, "Entrypoint must not be empty")
  .refine((val) => !val.includes(".."), "Entrypoint must not contain path traversal (..)")
  .refine((val) => !val.startsWith("/"), "Entrypoint must not be an absolute path");

const limitsSchema = z
  .object({
    timeout: z.number().int().min(10).max(3600).optional(),
    memory: z.number().int().min(64).max(4096).optional(),
  })
  .optional();

const scraperEntrySchema = z.object({
  name: z.string().min(1, "Scraper name must not be empty").max(255),
  slug: slugSchema,
  runtime: runtimeSchema.optional(),
  entrypoint: entrypointSchema,
  output: z
    .string()
    .min(1)
    .refine((v) => !v.includes("..") && !v.startsWith("/"), "Output path must not contain traversal")
    .optional(),
  schedule: z.string().optional(),
  limits: limitsSchema,
});

const defaultsSchema = z.object({ runtime: runtimeSchema.optional(), limits: limitsSchema }).optional();

const manifestSchema = z.object({
  scrapers: z.array(scraperEntrySchema).min(1, "Manifest must define at least one scraper"),
  defaults: defaultsSchema,
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A fully-resolved scraper definition after defaults have been applied. */
export interface ParsedScraper {
  name: string;
  slug: string;
  runtime: "python" | "node";
  entrypoint: string;
  output: string;
  schedule: string | null;
  limits: { timeout: number; memory: number };
}

/** Result of parsing a manifest file. */
export interface ManifestParseResult {
  success: true;
  scrapers: ParsedScraper[];
}

/** Error result when parsing fails. */
export interface ManifestParseError {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RUNTIME: "python" | "node" = "python";
const DEFAULT_OUTPUT = "data.csv";
const DEFAULT_TIMEOUT = 300;
const DEFAULT_MEMORY = 512;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse and validate a `scrapers.yml` manifest string.
 *
 * Applies the optional `defaults` block to every scraper entry. Individual
 * scraper fields take precedence over defaults.
 *
 * @param yamlContent - Raw YAML string from the manifest file
 * @returns Parsed scraper definitions or an error
 */
export const parseManifest = (yamlContent: string): ManifestParseResult | ManifestParseError => {
  try {
    const raw: unknown = parseYaml(yamlContent);

    if (raw == null || typeof raw !== "object") {
      return { success: false, error: "Manifest is empty or not a valid YAML object" };
    }

    const parsed = manifestSchema.safeParse(raw);

    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      logger.warn("Manifest validation failed", { errors: messages });
      return { success: false, error: `Manifest validation failed: ${messages}` };
    }

    const { scrapers: entries, defaults } = parsed.data;

    // Check for duplicate slugs
    const slugs = new Set<string>();
    for (const entry of entries) {
      if (slugs.has(entry.slug)) {
        return { success: false, error: `Duplicate scraper slug: ${entry.slug}` };
      }
      slugs.add(entry.slug);
    }

    const scrapers: ParsedScraper[] = entries.map((entry) => ({
      name: entry.name,
      slug: entry.slug,
      runtime: entry.runtime ?? defaults?.runtime ?? DEFAULT_RUNTIME,
      entrypoint: entry.entrypoint,
      output: entry.output ?? DEFAULT_OUTPUT,
      schedule: entry.schedule ?? null,
      limits: {
        timeout: entry.limits?.timeout ?? defaults?.limits?.timeout ?? DEFAULT_TIMEOUT,
        memory: entry.limits?.memory ?? defaults?.limits?.memory ?? DEFAULT_MEMORY,
      },
    }));

    logger.info("Manifest parsed successfully", { scraperCount: scrapers.length, slugs: scrapers.map((s) => s.slug) });

    return { success: true, scrapers };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to parse manifest YAML", { error: message });
    return { success: false, error: `YAML parse error: ${message}` };
  }
};
