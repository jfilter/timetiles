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
  idempotent: boolean;
  deploymentEnv?: "staging" | "production";
  volume?: string;
  realism?: string;
  performance?: string;
  debugging?: string;
  randomSeed?: number;
}

const VALID_PRESETS = new Set(["testing", "e2e", "development", "deploy"]);

const parseDeploymentEnv = (raw: string | undefined): "staging" | "production" | undefined => {
  if (raw === undefined) return undefined;
  if (raw !== "staging" && raw !== "production") {
    throw new Error(`Invalid --deployment-env: ${raw}. Must be "staging" or "production".`);
  }
  return raw;
};

const isFlag = (arg: string, flag: string): boolean => arg === flag;

const parseFlagArgs = (args: string[]): ParsedArgs => {
  const result: ParsedArgs = { preset: "development", collections: [], truncate: false, idempotent: false };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg == null) {
      i++;
      continue;
    }

    const consumedNext = applyArg(arg, nextArg, result);
    i += consumedNext ? 2 : 1;
  }

  return result;
};

/**
 * Apply a single CLI arg to the result. Returns true if the next arg was
 * also consumed (option-with-value), false otherwise.
 */
const applyArg = (arg: string, nextArg: string | undefined, result: ParsedArgs): boolean => {
  // Boolean flags
  if (isFlag(arg, "--truncate")) {
    result.truncate = true;
    return false;
  }
  if (isFlag(arg, "--idempotent")) {
    result.idempotent = true;
    return false;
  }
  if (isFlag(arg, "--random")) {
    result.randomSeed = Date.now();
    return false;
  }

  // Options that take a value
  if (nextArg != null) {
    if (isFlag(arg, "--deployment-env")) {
      result.deploymentEnv = parseDeploymentEnv(nextArg);
      return true;
    }
    if (isFlag(arg, "--volume")) {
      result.volume = nextArg;
      return true;
    }
    if (isFlag(arg, "--realism")) {
      result.realism = nextArg;
      return true;
    }
    if (isFlag(arg, "--performance")) {
      result.performance = nextArg;
      return true;
    }
    if (isFlag(arg, "--debugging")) {
      result.debugging = nextArg;
      return true;
    }
    if (isFlag(arg, "--seed")) {
      result.randomSeed = Number.parseInt(nextArg, 10);
      return true;
    }
  }

  // Positional: preset name or collection name
  if (VALID_PRESETS.has(arg)) {
    result.preset = arg;
  } else if (!arg.startsWith("--")) {
    result.collections.push(arg);
  }
  return false;
};

const parseArguments = (args: string[]): ParsedArgs => {
  const result = parseFlagArgs(args);

  // Deploy preset: auto-detect deploymentEnv from runtime env so
  // `pnpm seed deploy` on a staging/prod host respects
  // DEPLOYMENT_ENVIRONMENT just like the onInit boot path.
  if (result.preset === "deploy" && !result.deploymentEnv) {
    const runtimeEnv = process.env.DEPLOYMENT_ENVIRONMENT;
    if (runtimeEnv === "staging" || runtimeEnv === "production") {
      result.deploymentEnv = runtimeEnv;
    }
  }

  // Deploy preset is intrinsically idempotent; truncate would defeat the point.
  if (result.preset === "deploy") {
    if (result.truncate) {
      throw new Error("`deploy` preset cannot be combined with --truncate");
    }
    result.idempotent = true;
  }

  return result;
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command == null || command === "" || command === "help") {
    logger.info(`
Usage: pnpm seed [preset] [collections...] [options]

Presets:
  testing        Fast, deterministic data for tests
  e2e            Moderate data for E2E testing
  development    Rich, realistic data for local dev (default)
  deploy         Idempotent on-boot bootstrap (sites, pages, globals, geocoding)

Options:
  --truncate                  Truncate collections before seeding (incompatible with deploy)
  --idempotent                Skip-if-exists per record; skip globals already populated
  --deployment-env <env>      staging|production — selects per-env seed variants (deploy preset)
  --volume <level>            Override volume: small|medium|large
  --realism <level>           Override realism: simple|realistic
  --performance <level>       Override performance: fast|balanced|rich
  --debugging <level>         Override debugging: quiet|normal|verbose
  --random                    Use random seed (different data each run)
  --seed <number>             Use specific seed for deterministic random data

Examples:
  pnpm seed                           # Seed development preset
  pnpm seed testing                   # Seed testing preset
  pnpm seed development users events  # Seed only users and events
  pnpm seed --volume large --random   # Development with large volume, random data
  pnpm seed e2e --seed 12345          # E2E preset with specific seed
  pnpm seed --truncate                # Truncate and seed
  pnpm seed deploy                    # Idempotent deploy bootstrap (uses DEPLOYMENT_ENVIRONMENT)
  pnpm seed deploy --deployment-env staging  # Force staging variant locally
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
      const {
        preset,
        collections,
        truncate,
        idempotent,
        deploymentEnv,
        volume,
        realism,
        performance,
        debugging,
        randomSeed,
      } = parseArguments(args);

      const flags = [
        truncate ? "truncate" : null,
        idempotent ? "idempotent" : null,
        deploymentEnv ? `env=${deploymentEnv}` : null,
      ].filter(Boolean);
      const flagsLabel = flags.length > 0 ? ` (${flags.join(", ")})` : "";
      logger.info({ preset, truncate, idempotent, deploymentEnv }, `Starting seed: preset=${preset}${flagsLabel}`);

      // Add timeout protection for seed operations
      await Promise.race([
        seedManager.seedWithConfig({
          preset,
          collections: collections.length > 0 ? collections : undefined,
          truncate,
          idempotent,
          deploymentEnv,
          volume: volume as "small" | "medium" | "large" | undefined,
          realism: realism as "simple" | "realistic" | undefined,
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
    logger.info("❌ Seed operation failed");
    process.exit(1);
  } finally {
    await seedManager.cleanup();
    process.exit(0);
  }
};

void main();
