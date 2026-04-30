/**
 * Auto-activate data packages on Payload init based on the deployment
 * environment.
 *
 * The activations config (`config/data-packages.activations.yml`) is
 * env-keyed: each `DEPLOYMENT_ENVIRONMENT` value maps to a list of
 * `(slug, params?)` tuples. On boot the matching list is iterated and
 * each entry is passed to {@link activateDataPackage}. Already-activated
 * entries are recognised and skipped silently — the only side effect is
 * a single summary log line at the end.
 *
 * Activation policy lives outside the manifest YAMLs on purpose: the
 * manifest describes _what_ a package is; deciding _which_ packages an
 * environment runs is a deployment concern. Parameterised manifests
 * (e.g. `ucdp-hdx`) provide their params here, which keeps the manifest
 * single-source-of-truth and avoids forking a template per country.
 *
 * @module
 * @category DataPackages
 */
import fs from "node:fs";
import path from "node:path";

import type { Payload } from "payload";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { createSystemUserService } from "@/lib/account/system-user";
import { getEnv } from "@/lib/config/env";
import { createLogger } from "@/lib/logger";
import type { DataPackageManifest } from "@/lib/types/data-packages";

import { activateDataPackage } from "./activation-service";
import { loadAllManifests } from "./manifest-loader";

const logger = createLogger("data-packages-auto-activate");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const entrySchema = z.object({ slug: z.string().min(1), params: z.record(z.string(), z.string()).optional() });

const activationsSchema = z.object({
  production: z.array(entrySchema).default([]),
  staging: z.array(entrySchema).default([]),
  preview: z.array(entrySchema).default([]),
  development: z.array(entrySchema).default([]),
});

type ActivationEntry = z.infer<typeof entrySchema>;

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the activations YAML path. Mirrors the dev/prod fallback in
 * manifest-loader.ts so the file lives next to the `data-packages/`
 * subdir in both layouts.
 */
const resolveActivationsFile = (): string => {
  const devPath = path.resolve("apps/web/config/data-packages.activations.yml");
  const prodPath = path.resolve("config/data-packages.activations.yml");
  if (fs.existsSync(devPath)) return devPath;
  return prodPath;
};

const loadActivationsFile = (): ReturnType<typeof activationsSchema.parse> | null => {
  const file = resolveActivationsFile();
  if (!fs.existsSync(file)) {
    logger.debug({ file }, "No activations config found, skipping");
    return null;
  }
  try {
    const raw = parseYaml(fs.readFileSync(file, "utf8")) as unknown;
    return activationsSchema.parse(raw ?? {});
  } catch (err) {
    logger.error({ err, file }, "Failed to parse activations config");
    return null;
  }
};

// ---------------------------------------------------------------------------
// Activation runner
// ---------------------------------------------------------------------------

const ALREADY_ACTIVE_PATTERN = /already activated/i;

interface RunResult {
  newlyActivated: number;
  alreadyActive: number;
  failed: number;
}

const activateOne = async (
  payload: Payload,
  entry: ActivationEntry,
  manifest: DataPackageManifest,
  userId: number
): Promise<"new" | "exists" | "fail"> => {
  // activateDataPackage takes the full User object but only reads .id
  // for createdBy / updatedBy fields — pass a minimal stub.
  const user = { id: userId } as Parameters<typeof activateDataPackage>[2];
  try {
    await activateDataPackage(payload, manifest, user, { parameters: entry.params, triggerFirstImport: true });
    return "new";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (ALREADY_ACTIVE_PATTERN.test(msg)) {
      return "exists";
    }
    logger.error({ err, slug: entry.slug, params: entry.params }, "Auto-activation failed");
    return "fail";
  }
};

/**
 * Load the activations config, filter by current DEPLOYMENT_ENVIRONMENT,
 * and activate each entry. Idempotent — re-runs are safe.
 *
 * Gated by `RUN_AUTO_ACTIVATIONS` env var so only one container per
 * deployment runs it (the web container; workers should leave it off).
 */
export const runAutoActivations = async (payload: Payload): Promise<void> => {
  const env = getEnv();
  if (!env.RUN_AUTO_ACTIVATIONS) {
    return;
  }

  const config = loadActivationsFile();
  if (!config) return;

  const entries = config[env.DEPLOYMENT_ENVIRONMENT];
  if (entries.length === 0) {
    logger.debug({ environment: env.DEPLOYMENT_ENVIRONMENT }, "No auto-activations configured");
    return;
  }

  const systemUser = await createSystemUserService(payload).getOrCreateSystemUser();

  // Load all manifests once and look up by slug (loadAllManifests scans
  // the whole config dir each call and would otherwise warn 5× for any
  // pre-existing schema-invalid manifest).
  const manifestsBySlug = new Map(loadAllManifests().map((m) => [m.slug, m]));

  const result: RunResult = { newlyActivated: 0, alreadyActive: 0, failed: 0 };
  for (const entry of entries) {
    const manifest = manifestsBySlug.get(entry.slug);
    if (!manifest) {
      logger.error({ slug: entry.slug }, "Auto-activation: manifest not found");
      result.failed += 1;
      continue;
    }
    const outcome = await activateOne(payload, entry, manifest, systemUser.id);
    if (outcome === "new") result.newlyActivated += 1;
    else if (outcome === "exists") result.alreadyActive += 1;
    else result.failed += 1;
  }

  logger.info(
    { ...result, environment: env.DEPLOYMENT_ENVIRONMENT, total: entries.length },
    `Auto-activated ${result.newlyActivated} package(s) for ${env.DEPLOYMENT_ENVIRONMENT} ` +
      `(${result.alreadyActive} already active, ${result.failed} failed)`
  );
};
