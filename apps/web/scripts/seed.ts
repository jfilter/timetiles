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

interface ParsedArgs {
  preset: string;
  collections: string[];
  truncate: boolean;
  volume?: string;
  realism?: string;
  performance?: string;
  debugging?: string;
  randomSeed?: number;
}

const parseArguments = (args: string[]): ParsedArgs => {
  const validPresets = ["minimal", "testing", "e2e", "development", "demo", "benchmark"];
  let preset = "development";
  const collections: string[] = [];
  let truncate = false;
  let volume: string | undefined;
  let realism: string | undefined;
  let performance: string | undefined;
  let debugging: string | undefined;
  let randomSeed: number | undefined;

  let skipNext = false;
  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[i];
    if (arg == null) continue;

    const nextArg = args[i + 1];

    if (arg === "--truncate") {
      truncate = true;
    } else if (arg === "--volume" && nextArg) {
      volume = nextArg;
      skipNext = true;
    } else if (arg === "--realism" && nextArg) {
      realism = nextArg;
      skipNext = true;
    } else if (arg === "--performance" && nextArg) {
      performance = nextArg;
      skipNext = true;
    } else if (arg === "--debugging" && nextArg) {
      debugging = nextArg;
      skipNext = true;
    } else if (arg === "--random") {
      randomSeed = Date.now();
    } else if (arg === "--seed" && nextArg) {
      randomSeed = parseInt(nextArg, 10);
      skipNext = true;
    } else if (validPresets.includes(arg)) {
      preset = arg;
    } else if (!arg.startsWith("--")) {
      collections.push(arg);
    }
  }

  return { preset, collections, truncate, volume, realism, performance, debugging, randomSeed };
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command == null || command === "" || command === "help") {
    logger.info(`
Usage: pnpm seed [preset] [collections...] [options]

Presets:
  minimal        Bare minimum data for production
  testing        Fast, deterministic data for tests
  e2e            Moderate data for E2E testing
  development    Rich, realistic data for local dev (default)
  demo           Polished data for demos
  benchmark      Large volumes for performance testing

Options:
  --truncate               Truncate collections before seeding
  --volume <level>         Override volume: minimal|small|medium|large|xlarge
  --realism <level>        Override realism: simple|realistic|production-like
  --performance <level>    Override performance: fast|balanced|rich
  --debugging <level>      Override debugging: quiet|normal|verbose
  --random                 Use random seed (different data each run)
  --seed <number>          Use specific seed for deterministic random data

Examples:
  pnpm seed                           # Seed development preset
  pnpm seed testing                   # Seed testing preset
  pnpm seed development users events  # Seed only users and events
  pnpm seed --volume large --random   # Development with large volume, random data
  pnpm seed benchmark --seed 12345    # Benchmark preset with specific seed
  pnpm seed truncate                  # Truncate all collections
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
  npm run seed truncate        # Truncate all tables
`);
    } else if (command === "truncate") {
      logger.info("Starting truncate operation");

      // Add timeout protection for truncate operations
      await Promise.race([
        seedManager.truncate(),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error(`Truncate operation timeout after ${TOTAL_TIMEOUT}ms`)), TOTAL_TIMEOUT)
        ),
      ]);
    } else {
      // Default to seed command - parse arguments
      const { preset, collections, truncate, volume, realism, performance, debugging, randomSeed } =
        parseArguments(args);

      logger.info(
        {
          preset,
          collections,
          truncate,
          volume,
          realism,
          performance,
          debugging,
          randomSeed,
          isCI,
          timeout: `${TOTAL_TIMEOUT}ms`,
        },
        "Starting seed operation"
      );

      // Add timeout protection for seed operations
      await Promise.race([
        seedManager.seedWithConfig({
          preset,
          collections: collections.length > 0 ? collections : undefined,
          truncate,
          volume: volume as "minimal" | "small" | "medium" | "large" | "xlarge" | undefined,
          realism: realism as "simple" | "realistic" | "production-like" | undefined,
          performance: performance as "fast" | "balanced" | "rich" | undefined,
          debugging: debugging as "quiet" | "normal" | "verbose" | undefined,
          randomSeed,
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
