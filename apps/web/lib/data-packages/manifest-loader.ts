/**
 * Load and validate data package manifests from YAML files.
 *
 * Reads `*.yml` files from `config/data-packages/` and validates them
 * against a Zod schema. Supports `$ENV:VAR_NAME` syntax for secrets
 * in auth fields.
 *
 * @module
 * @category DataPackages
 */
import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import type { DataPackageManifest } from "@/lib/types/data-packages";

const logger = createLogger("data-packages");

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const authConfigSchema = z
  .object({
    type: z.enum(["none", "api-key", "bearer", "basic"]),
    apiKey: z.string().optional(),
    apiKeyHeader: z.string().optional(),
    bearerToken: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    customHeaders: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const paginationSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["offset", "cursor", "page"]).optional(),
    pageParam: z.string().optional(),
    limitParam: z.string().optional(),
    limitValue: z.number().int().positive().optional(),
    cursorParam: z.string().optional(),
    nextCursorPath: z.string().optional(),
    totalPath: z.string().optional(),
    maxPagesPath: z.string().optional(),
    maxPages: z.number().int().positive().optional(),
    maxRecords: z.number().int().positive().optional(),
    method: z.enum(["GET", "POST"]).optional(),
    bodyTemplate: z.string().optional(),
    initialBodyTemplate: z.string().optional(),
  })
  .optional();

const htmlFieldDefSchema = z.object({
  name: z.string().min(1),
  selector: z.string().optional(),
  attribute: z.string().optional(),
});

const detailPageFieldSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  attribute: z.string().optional(),
  pattern: z.string().optional(),
});

const htmlExtractSchema = z
  .object({
    htmlPath: z.string().min(1),
    recordSelector: z.string().min(1),
    fields: z.array(htmlFieldDefSchema).min(1),
    detailPage: z
      .object({
        urlField: z.string().min(1),
        rateLimitMs: z.number().int().min(100).default(500),
        fields: z.array(detailPageFieldSchema).min(1),
      })
      .optional(),
  })
  .optional();

const publisherSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().optional(),
    acronym: z.string().optional(),
    description: z.string().optional(),
    country: z
      .string()
      .regex(/^[a-z]{2}$/)
      .optional(),
    official: z.boolean().optional(),
  })
  .optional();

const coverageSchema = z
  .object({ countries: z.array(z.string().regex(/^[a-z]{2}$/)).optional(), start: z.string().optional() })
  .optional();

const manifestSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  region: z.string().optional(),
  tags: z.array(z.string()).default([]),
  license: z.string().optional(),
  estimatedRecords: z.number().int().positive().optional(),
  url: z.string().optional(),
  publisher: publisherSchema,
  coverage: coverageSchema,

  source: z.object({
    url: z.string().min(1),
    format: z.enum(["json", "csv", "html-in-json"]),
    auth: authConfigSchema,
    jsonApi: z.object({ recordsPath: z.string().optional(), pagination: paginationSchema }).optional(),
    preProcessing: z
      .object({
        groupBy: z.string().optional(),
        mergeFields: z.record(z.string(), z.enum(["min", "max"])).optional(),
        extractFields: z
          .array(
            z.object({
              from: z.string().min(1),
              to: z.string().min(1),
              joinPath: z.string().optional(),
              separator: z.string().optional(),
            })
          )
          .optional(),
      })
      .optional(),
    excludeFields: z.array(z.string()).optional(),
    htmlExtract: htmlExtractSchema,
  }),

  catalog: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    isPublic: z.boolean().default(true),
    license: z.string().optional(),
    sourceUrl: z.string().optional(),
    category: z.string().optional(),
    region: z.string().optional(),
    tags: z.array(z.string()).optional(),
    publisher: publisherSchema,
  }),

  dataset: z.object({
    name: z.string().min(1),
    language: z.string().default("eng"),
    license: z.string().optional(),
    sourceUrl: z.string().optional(),
    idStrategy: z
      .object({
        type: z.enum(["external", "content-hash", "auto-generate"]),
        externalIdPath: z.string().optional(),
        duplicateStrategy: z.enum(["skip", "update", "version"]).default("skip"),
      })
      .optional(),
    publisher: publisherSchema,
    coverage: coverageSchema,
  }),

  fieldMappings: z.object({
    titlePath: z.string().optional(),
    descriptionPath: z.string().optional(),
    timestampPath: z.string().optional(),
    endTimestampPath: z.string().optional(),
    locationNamePath: z.string().optional(),
    locationPath: z.string().optional(),
    latitudePath: z.string().optional(),
    longitudePath: z.string().optional(),
  }),

  schedule: z.object({
    type: z.enum(["frequency", "cron"]),
    frequency: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
    cronExpression: z.string().optional(),
    schemaMode: z.enum(["strict", "additive", "flexible"]).default("additive"),
    timezone: z.string().default("UTC"),
  }),

  transforms: z
    .array(
      z.object({
        type: z.enum(["rename", "date-parse", "string-op", "concatenate", "split", "parse-json-array", "extract"]),
        from: z.string().optional(),
        to: z.string().optional(),
        // split
        delimiter: z.string().optional(),
        toFields: z.array(z.string()).optional(),
        // date-parse
        inputFormat: z.string().optional(),
        outputFormat: z.string().optional(),
        timezone: z.string().optional(),
        // string-op
        operation: z.enum(["uppercase", "lowercase", "replace", "expression"]).optional(),
        pattern: z.string().optional(),
        replacement: z.string().optional(),
        // extract
        group: z.number().int().optional(),
        expression: z.string().optional(),
        // concatenate
        fromFields: z.array(z.string()).optional(),
        separator: z.string().optional(),
      })
    )
    .optional(),

  reviewChecks: z
    .object({
      skipTimestampCheck: z.boolean().optional(),
      skipLocationCheck: z.boolean().optional(),
      skipEmptyRowCheck: z.boolean().optional(),
      skipRowErrorCheck: z.boolean().optional(),
      skipDuplicateRateCheck: z.boolean().optional(),
      skipGeocodingCheck: z.boolean().optional(),
    })
    .optional(),

  parameters: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .regex(/^[a-z][a-z0-9_]*$/, "Parameter name must be lowercase alphanumeric"),
        label: z.string().min(1),
        required: z.boolean().default(false),
        example: z.string().optional(),
      })
    )
    .optional(),

  setup: z
    .object({ instructions: z.string().min(1), url: z.string().optional(), envVars: z.array(z.string()) })
    .optional(),

  geocodingBias: z
    .object({
      countryCodes: z.array(z.string().regex(/^[a-z]{2}$/)).optional(),
      viewBox: z.object({ minLon: z.number(), minLat: z.number(), maxLon: z.number(), maxLat: z.number() }).optional(),
      bounded: z.boolean().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const resolveDataPackagesDir = (): string => {
  // Same pattern as app-config.ts: dev = monorepo root, prod = /app
  const devPath = path.resolve("apps/web/config/data-packages");
  const prodPath = path.resolve("config/data-packages");

  if (fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(prodPath)) return prodPath;

  return devPath;
};

// ---------------------------------------------------------------------------
// Environment variable resolution
// ---------------------------------------------------------------------------

const ENV_REF_PATTERN = /^\$ENV:(.+)$/;

/**
 * Resolve `$ENV:VAR_NAME` references in auth config fields.
 * Returns undefined for unresolvable env vars (package will be listed
 * but marked as not activatable).
 */
const resolveEnvRefs = (value: string | undefined): string | undefined => {
  if (!value) return value;
  const match = ENV_REF_PATTERN.exec(value);
  if (!match?.[1]) return value;
  return process.env[match[1]] ?? undefined;
};

const resolveAuthEnvRefs = (auth: DataPackageManifest["source"]["auth"]): DataPackageManifest["source"]["auth"] => {
  if (!auth) return auth;
  return {
    ...auth,
    apiKey: resolveEnvRefs(auth.apiKey),
    bearerToken: resolveEnvRefs(auth.bearerToken),
    username: resolveEnvRefs(auth.username),
    password: resolveEnvRefs(auth.password),
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load and validate all data package manifests from the config directory. */
export const loadAllManifests = (): DataPackageManifest[] => {
  const dir = resolveDataPackagesDir();

  if (!fs.existsSync(dir)) {
    logger.debug({ dir }, "Data packages directory does not exist");
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const manifests: DataPackageManifest[] = [];

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseYaml(raw) as unknown;
      const validated = manifestSchema.parse(parsed);

      const manifest = validated as unknown as DataPackageManifest;

      // Promote top-level metadata to catalog block (backward-compatible fallback)
      if (manifest.license && !manifest.catalog.license) manifest.catalog.license = manifest.license;
      if (manifest.region && !manifest.catalog.region) manifest.catalog.region = manifest.region;
      if (manifest.tags?.length && !manifest.catalog.tags?.length) manifest.catalog.tags = manifest.tags;
      if (manifest.category && !manifest.catalog.category) manifest.catalog.category = manifest.category;

      manifests.push({ ...manifest, source: { ...manifest.source, auth: resolveAuthEnvRefs(manifest.source.auth) } });
    } catch (error) {
      logger.warn({ file, error }, "Failed to load data package manifest");
    }
  }

  return manifests;
};

/** Load a single data package manifest by slug. */
export const loadManifest = (slug: string): DataPackageManifest | undefined => {
  return loadAllManifests().find((m) => m.slug === slug);
};
