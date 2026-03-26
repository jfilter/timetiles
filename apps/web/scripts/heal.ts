#!/usr/bin/env node
/**
 * CLI tool to detect and fix data inconsistencies.
 *
 * Usage:
 *   pnpm heal              # Run all checks + fix
 *   pnpm heal --dry-run    # Report only, don't fix
 *
 * @module
 * @category Scripts
 */

import { getPayload } from "payload";

import { buildConfigWithDefaults } from "@/lib/config/payload-config-factory";
import { createLogger, logError } from "@/lib/logger";
import { runHealChecks } from "@/lib/services/heal-service";

const logger = createLogger("heal");

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  logger.info("Initializing Payload...");
  const payload = await getPayload({ config: await buildConfigWithDefaults() });

  try {
    const results = await runHealChecks(payload, { dryRun });

    logger.info("=== Heal Summary ===%s", dryRun ? " (DRY RUN)" : "");
    for (const r of results) {
      logger.info("  %-25s fixed=%d, skipped=%d, errors=%d", r.check, r.fixed, r.skipped, r.errors);
      for (const detail of r.details) {
        logger.info("    %s", detail);
      }
    }
  } catch (error) {
    logError(error, "Heal failed");
    process.exit(1);
  } finally {
    if (payload.db?.pool != null && (payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        await (payload.db.pool as { end?: () => Promise<void> }).end?.();
      } catch {
        // cleanup
      }
    }
  }
};

const run = async () => {
  await main();
  process.exit(0);
};

void run();
