#!/usr/bin/env node
/**
 * Loads demo datasets from data packages.
 *
 * Thin wrapper around the data packages system. Installs all available
 * data packages (Berlin Open Data, polizeistressi.de, etc.) as demo data.
 *
 * Usage:
 *   pnpm demo-data               # Install all data packages
 *   pnpm demo-data --trigger     # Also trigger immediate import for all
 *   pnpm demo-data --clean       # Uninstall all data packages
 *
 * @module
 * @category Scripts
 */

import { getPayload } from "payload";

import { createSystemUserService } from "@/lib/account/system-user";
import { buildConfigWithDefaults } from "@/lib/config/payload-config-factory";
import {
  activateDataPackage,
  deactivateDataPackage,
  getActivationStatus,
} from "@/lib/data-packages/activation-service";
import { loadAllManifests } from "@/lib/data-packages/manifest-loader";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("demo-data");

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

const getOrCreateSystemUser = async (payload: PayloadInstance) => {
  const service = createSystemUserService(payload);
  return service.getOrCreateSystemUser();
};

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

const installDemoData = async (payload: PayloadInstance, shouldTrigger: boolean) => {
  const manifests = loadAllManifests();
  if (manifests.length === 0) {
    logger.info("No data packages found in config/data-packages/");
    return;
  }

  const systemUser = await getOrCreateSystemUser(payload);
  logger.info({ userId: systemUser.id }, "Using system user");

  let installed = 0;
  let skipped = 0;

  for (const manifest of manifests) {
    try {
      const result = await activateDataPackage(payload, manifest, systemUser, { triggerFirstImport: shouldTrigger });
      logger.info(
        "Installed: %s (catalog=%d, dataset=%d, schedule=%d)",
        manifest.slug,
        result.catalogId,
        result.datasetId,
        result.scheduledIngestId
      );
      installed++;
    } catch (error) {
      if (error instanceof Error && error.message.includes("already activated")) {
        logger.info("Already installed: %s", manifest.slug);
        skipped++;
      } else {
        throw error;
      }
    }
  }

  logger.info("=== Demo Data Summary ===");
  logger.info("  Installed: %d, Skipped: %d, Total: %d", installed, skipped, manifests.length);
  if (shouldTrigger && installed > 0) {
    logger.info("  First imports triggered for %d packages.", installed);
  }
};

// ---------------------------------------------------------------------------
// Clean
// ---------------------------------------------------------------------------

const cleanDemoData = async (payload: PayloadInstance) => {
  const manifests = loadAllManifests();
  const slugs = manifests.map((m) => m.slug);
  const statusMap = await getActivationStatus(payload, slugs);

  if (statusMap.size === 0) {
    logger.info("No installed data packages found, nothing to clean.");
    return;
  }

  const systemUser = await getOrCreateSystemUser(payload);
  let cleaned = 0;

  for (const slug of statusMap.keys()) {
    try {
      await deactivateDataPackage(payload, slug, systemUser);
      logger.info("Disabled: %s", slug);
      cleaned++;
    } catch (error) {
      logger.warn("Failed to disable %s: %s", slug, error instanceof Error ? error.message : "unknown");
    }
  }

  logger.info("Disabled %d data packages.", cleaned);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const args = process.argv.slice(2);
  const shouldTrigger = args.includes("--trigger");
  const shouldClean = args.includes("--clean");

  logger.info("Initializing Payload...");
  const payload = await getPayload({ config: await buildConfigWithDefaults() });

  try {
    if (shouldClean) {
      await cleanDemoData(payload);
    } else {
      await installDemoData(payload, shouldTrigger);
    }
  } catch (error) {
    logError(error, "Failed to manage demo data");
    process.exit(1);
  } finally {
    if (payload.db?.pool != null && (payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        await (payload.db.pool as { end?: () => Promise<void> }).end?.();
      } catch {
        // Connection pool will be cleaned up on process exit
      }
    }
  }
};

const run = async () => {
  await main();
  process.exit(0);
};

void run();
