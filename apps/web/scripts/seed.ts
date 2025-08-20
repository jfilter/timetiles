#!/usr/bin/env node
/**
 * Database seeding CLI script.
 *
 * Provides commands to seed the database with test data for different
 * environments (development, test, production). Supports truncating
 * existing data and seeding specific collections.
 *
 * @module
 * @category Scripts
 */

import { createLogger, logError } from "../lib/logger.js";
import { createSeedManager } from "../lib/seed/index.js";

const logger = createLogger("seed-cli");

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command == null || command === "") {
    logger.info(`
Usage: npm run seed [command] [options]

Commands:
  seed [env] [collections...]   Seed data for the specified environment
  truncate [collections...]     Truncate specified collections
  help                         Show this help message

Examples:
  npm run seed                 # Seed all collections for development
  npm run seed test            # Seed all collections for test environment
  npm run seed development users catalogs  # Seed only users and catalogs
  npm run seed truncate        # Truncate all collections
  npm run seed truncate users  # Truncate only users collection
`);
    process.exit(0);
  }

  const seedManager = createSeedManager();
  const isCI = process.env.CI === "true";
  const TOTAL_TIMEOUT = isCI ? 5 * 60 * 1000 : 15 * 60 * 1000; // 5 minutes for CI, 15 for local

  try {
    if (command === "help") {
      logger.info(`
Usage: npm run seed [command] [options]

Commands:
  seed [env] [collections...]   Seed data for the specified environment
  truncate [collections...]     Truncate specified collections
  help                         Show this help message

Examples:
  npm run seed                 # Seed all collections for development
  npm run seed test            # Seed all collections for test environment
  npm run seed development users catalogs  # Seed only users and catalogs
  npm run seed truncate        # Truncate all collections
  npm run seed truncate users  # Truncate only users collection
`);
    } else if (command === "truncate") {
      const collections = args.slice(1);
      logger.info({ collections }, "Starting truncate operation");

      // Add timeout protection for truncate operations
      await Promise.race([
        seedManager.truncate(collections),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error(`Truncate operation timeout after ${TOTAL_TIMEOUT}ms`)), TOTAL_TIMEOUT)
        ),
      ]);
    } else {
      // Default to seed command
      let environment = "development";
      let collections: string[] = [];

      // Parse arguments
      if (args.length > 0) {
        if (args[0] != null && args[0] !== "" && ["development", "test", "production"].includes(args[0])) {
          environment = args[0] as "development" | "test" | "production";
          collections = args.slice(1);
        } else {
          collections = args;
        }
      }

      logger.info({ environment, collections, isCI, timeout: `${TOTAL_TIMEOUT}ms` }, "Starting seed operation");

      // Add timeout protection for seed operations
      await Promise.race([
        seedManager.seed({
          environment: environment as "development" | "test" | "production",
          collections: collections.length > 0 ? collections : undefined,
          truncate: false,
        }),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error(`Seed operation timeout after ${TOTAL_TIMEOUT}ms`)), TOTAL_TIMEOUT)
        ),
      ]);
    }
  } catch (error) {
    logError(error, "Seed operation failed", { command, args });
    logger.error("❌ Seed operation failed"); // User-facing error
    process.exit(1);
  } finally {
    await seedManager.cleanup();
    process.exit(0);
  }
};

void main();
