/**
 * Defines the Payload CMS collection for individual scraper definitions.
 *
 * Each scraper belongs to a scraper-repo and defines a single entrypoint,
 * runtime, schedule, and output file. One scraper produces one CSV.
 * See ADR 0015 for full architecture.
 *
 * @category Collections
 * @module
 */
import type { CollectionBeforeChangeHook, CollectionConfig, Where } from "payload";

import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import { computeWebhookUrl, handleWebhookTokenLifecycle } from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";

import { createCommonConfig, createOwnershipAccess, isEditorOrAdmin, isPrivileged } from "./shared-fields";

/** Reserved environment variable prefixes that must not be overridden by scrapers. */
const RESERVED_ENV_PREFIXES = [
  "PAYLOAD_",
  "DATABASE_",
  "POSTGRES_",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "SCRAPER_",
  "NODE_",
  "SECRET",
];

/** Maximum number of environment variables per scraper. */
const MAX_ENV_VARS = 50;

/** Valid environment variable key pattern. */
const ENV_KEY_PATTERN = /^[A-Za-z_]\w*$/;

/**
 * Validates entrypoint path to prevent path traversal and absolute paths.
 */
const validateEntrypoint = (value: unknown): string | true => {
  if (!value || typeof value !== "string") return "Entrypoint is required";
  if (value.includes("..")) return "Entrypoint must not contain path traversal (..)";
  if (value.startsWith("/")) return "Entrypoint must be a relative path";
  if (value.includes("\0")) return "Entrypoint contains invalid characters";
  if (value.length > 255) return "Entrypoint must be at most 255 characters";
  return true;
};

/**
 * Validates environment variables object for safe keys and values.
 */
const validateEnvVars = (value: unknown): string | true => {
  if (value == null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return true; // Allow empty/null
  }
  if (typeof value !== "object" || Array.isArray(value)) return "Environment variables must be an object";
  const entries = Object.entries(value);
  if (entries.length > MAX_ENV_VARS) return `Maximum ${MAX_ENV_VARS} environment variables allowed`;
  for (const [key] of entries) {
    if (!ENV_KEY_PATTERN.test(key))
      return `Invalid environment variable key: "${key}". Keys must match [A-Za-z_][A-Za-z0-9_]*`;
    if (RESERVED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      return `Reserved environment variable prefix: "${key}". Keys starting with ${RESERVED_ENV_PREFIXES.join(", ")} are not allowed`;
    }
  }
  return true;
};

/**
 * Looks up a repo by ID, validates the current user owns it (unless privileged),
 * and returns the repo owner's ID for denormalized storage.
 */
const resolveRepoOwner = async (
  payload: {
    findByID: (args: {
      collection: "scraper-repos";
      id: number;
      overrideAccess: boolean;
    }) => Promise<{ createdBy?: unknown }>;
  },
  repoId: number,
  user: { id: number; role?: string | null } | undefined,
  errorMessage: string
): Promise<number | undefined> => {
  const repo = await payload.findByID({ collection: "scraper-repos", id: repoId, overrideAccess: true });
  if (!repo) {
    throw new Error("Scraper repo not found");
  }
  const repoOwnerId = extractRelationId(repo.createdBy) as number | undefined;
  if (user && !isPrivileged(user) && repoOwnerId !== user.id) {
    throw new Error(errorMessage);
  }
  return repoOwnerId;
};

/**
 * beforeChange hook that server-sets repoCreatedBy and validates repo ownership.
 *
 * On create: looks up the repo, validates the user owns it, and sets repoCreatedBy.
 * On update: strips client-sent repoCreatedBy; if repo changes, re-validates and re-sets.
 */
const validateAndSetRepoOwnership: CollectionBeforeChangeHook = async ({ data, req, operation, originalDoc }) => {
  if (!data) return data;
  if (req.context?.seed) return data;

  // Collect all mutations before applying — avoids require-atomic-updates false positives
  let repoCreatedBy: number | undefined;
  let shouldDeleteRepoCreatedBy = false;

  if (operation === "create") {
    const repoId = extractRelationId(data.repo);
    if (repoId) {
      repoCreatedBy = await resolveRepoOwner(
        req.payload,
        repoId,
        req.user ?? undefined,
        "You can only create scrapers for your own scraper repos"
      );
    }
  }

  if (operation === "update") {
    // Prevent client-initiated updates to repoCreatedBy
    if (req.user) {
      shouldDeleteRepoCreatedBy = true;
    }
    // If repo field is changing, re-validate and re-set
    const newRepoId = data.repo !== undefined ? extractRelationId(data.repo) : undefined;
    const originalRepoId = extractRelationId(originalDoc?.repo);
    if (newRepoId && newRepoId !== originalRepoId) {
      repoCreatedBy = await resolveRepoOwner(
        req.payload,
        newRepoId,
        req.user ?? undefined,
        "You can only assign scrapers to your own scraper repos"
      );
      shouldDeleteRepoCreatedBy = false; // override: we have a new value
    }
  }

  // Build result without mutating data after awaits
  if (shouldDeleteRepoCreatedBy && repoCreatedBy === undefined) {
    const { repoCreatedBy: _stripped, ...rest } = data;
    return rest;
  }
  if (repoCreatedBy !== undefined) {
    return { ...data, repoCreatedBy };
  }
  return data;
};

const Scrapers: CollectionConfig = {
  slug: "scrapers",
  ...createCommonConfig({ versions: false, drafts: false }),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "runtime", "enabled", "lastRunStatus", "updatedAt"],
    group: "Scrapers",
  },
  access: {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;
      if (!user) return false;
      return { repoCreatedBy: { equals: user.id } } as Where;
    },
    create: async ({ req: { user, payload } }) => {
      if (!user) return false;
      const enabled = await isFeatureEnabled(payload, "enableScrapers");
      if (!enabled) return false;
      const trustLevel = typeof user.trustLevel === "string" ? Number(user.trustLevel) : (user.trustLevel ?? 0);
      return trustLevel >= 3 || user.role === "admin";
    },
    update: createOwnershipAccess("scrapers", "repoCreatedBy"),
    delete: isEditorOrAdmin,
    readVersions: isEditorOrAdmin,
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 255 },
    { name: "slug", type: "text", required: true, maxLength: 255, index: true },
    // Relationship to repo
    {
      name: "repo",
      type: "relationship",
      relationTo: "scraper-repos",
      required: true,
      admin: { description: "Source code repository containing this scraper" },
    },
    // Denormalized owner for zero-query access control (server-set only)
    {
      name: "repoCreatedBy",
      type: "number",
      index: true,
      admin: { hidden: true, readOnly: true, description: "Denormalized from repo.createdBy for access control" },
    },
    // Execution config
    {
      name: "runtime",
      type: "select",
      required: true,
      defaultValue: "python",
      options: [
        { label: "Python", value: "python" },
        { label: "Node.js", value: "node" },
      ],
    },
    {
      name: "entrypoint",
      type: "text",
      required: true,
      validate: validateEntrypoint,
      admin: { description: "Script path relative to repo root (e.g., scraper.py)" },
    },
    { name: "outputFile", type: "text", defaultValue: "data.csv", admin: { description: "Output CSV filename" } },
    // Scheduling
    {
      name: "schedule",
      type: "text",
      admin: { description: "Cron expression (e.g., 0 6 * * *). Leave empty for manual-only." },
    },
    { name: "enabled", type: "checkbox", defaultValue: true },
    // Resource limits
    {
      name: "timeoutSecs",
      type: "number",
      defaultValue: 300,
      min: 10,
      max: 3600,
      admin: { description: "Max execution time in seconds" },
    },
    {
      name: "memoryMb",
      type: "number",
      defaultValue: 512,
      min: 64,
      max: 4096,
      admin: { description: "Memory limit in MB" },
    },
    // Environment variables (may contain secrets — field-level access as defense-in-depth)
    {
      name: "envVars",
      type: "json",
      defaultValue: {},
      validate: validateEnvVars,
      access: { read: ({ req: { user } }) => user?.role === "admin" },
      admin: { description: "Environment variables passed to the scraper" },
    },
    // TimeTiles integration
    {
      name: "targetDataset",
      type: "relationship",
      relationTo: "datasets",
      admin: { description: "Dataset to import scraped data into" },
    },
    {
      name: "autoImport",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Automatically import CSV into target dataset after successful scrape" },
    },
    // Data quality review checks
    {
      name: "reviewChecks",
      type: "group",
      label: "Data Quality Review Checks",
      admin: {
        description:
          "Configure which data quality checks pause the import for review. All checks are enabled by default.",
        condition: (data) => data?.autoImport === true,
      },
      fields: [
        {
          name: "skipTimestampCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'no timestamp' check",
          admin: { description: "Don't pause when no date/time field is detected", width: "50%" },
        },
        {
          name: "skipLocationCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'no location' check",
          admin: { description: "Don't pause when no location field is detected", width: "50%" },
        },
        {
          name: "skipEmptyRowCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'high empty rows' check",
          admin: { description: "Don't pause when many rows are empty", width: "50%" },
        },
        {
          name: "skipRowErrorCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'high row errors' check",
          admin: { description: "Don't pause when many rows fail during creation", width: "50%" },
        },
        {
          name: "skipDuplicateRateCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'high duplicates' check",
          admin: { description: "Don't pause when most rows are duplicates", width: "50%" },
        },
        {
          name: "skipGeocodingCheck",
          type: "checkbox",
          defaultValue: false,
          label: "Skip 'geocoding failure' check",
          admin: { description: "Don't pause when geocoding has a high failure rate", width: "50%" },
        },
        {
          name: "emptyRowThreshold",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            description: "Override empty row rate threshold (0–1). Leave blank for global default.",
            step: 0.05,
            width: "50%",
          },
        },
        {
          name: "rowErrorThreshold",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            description: "Override row error rate threshold (0–1). Leave blank for global default.",
            step: 0.05,
            width: "50%",
          },
        },
        {
          name: "duplicateRateThreshold",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            description: "Override duplicate rate threshold (0–1). Leave blank for global default.",
            step: 0.05,
            width: "50%",
          },
        },
        {
          name: "geocodingFailureThreshold",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            description: "Override geocoding failure threshold (0–1). Leave blank for global default.",
            step: 0.05,
            width: "50%",
          },
        },
      ],
    },
    // Runtime stats (updated by jobs, read-only in admin)
    { name: "lastRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
    {
      name: "lastRunStatus",
      type: "select",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Timeout", value: "timeout" },
        { label: "Running", value: "running" },
      ],
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "statistics",
      type: "json",
      defaultValue: { totalRuns: 0, successRuns: 0, failedRuns: 0 },
      admin: { readOnly: true },
    },
    // Next scheduled run
    { name: "nextRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
    // Webhook trigger
    {
      name: "webhookEnabled",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Enable webhook trigger for this scraper" },
    },
    {
      name: "webhookToken",
      type: "text",
      maxLength: 64,
      index: true,
      access: { read: () => false },
      admin: { hidden: true },
    },
    {
      name: "webhookUrl",
      type: "text",
      admin: {
        readOnly: true,
        description: "POST to this URL to trigger the scraper",
        condition: (data) => Boolean(data?.webhookEnabled && data?.webhookToken),
      },
      hooks: { afterRead: [({ data }) => computeWebhookUrl(data)] },
    },
  ],
  hooks: {
    beforeChange: [
      validateAndSetRepoOwnership,
      ({ data, originalDoc }) => {
        if (data) handleWebhookTokenLifecycle(data, originalDoc);
        return data;
      },
    ],
  },
};

export default Scrapers;
