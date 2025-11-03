#!/usr/bin/env tsx

/**
 * Unified Payload Generation Script.
 *
 * This script generates all Payload-related files (types and database schema)
 * and automatically formats them with Prettier to ensure consistent formatting
 * across all environments (local development and CI/CD).
 *
 * @module
 */

import { execSync } from "node:child_process";

import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("payload-generate");

const generate = () => {
  try {
    logger.info("🔄 Starting Payload file generation...");

    // Generate TypeScript types
    logger.info("📝 Generating TypeScript types...");
    execSync("payload generate:types", { stdio: "pipe" });
    logger.info("✓ TypeScript types generated");

    // Generate database schema
    logger.info("🗄️ Generating database schema...");
    execSync("payload generate:db-schema", { stdio: "pipe" });
    logger.info("✓ Database schema generated");

    // Format both files with Prettier to ensure consistent formatting
    logger.info("✨ Formatting generated files with Prettier...");
    execSync("prettier --write payload-types.ts payload-generated-schema.ts", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    logger.info("✓ Files formatted");

    logger.info("✅ Successfully generated and formatted all Payload files!");
    logger.info("Files updated: payload-types.ts, payload-generated-schema.ts");
  } catch (error) {
    logError(error, "Failed to generate Payload files");
    logger.error("❌ Generation failed. Please check the error above.");
    process.exit(1);
  }
};

// Run the generation
generate();
