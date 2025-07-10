#!/usr/bin/env tsx

/**
 * Type Validation Script
 *
 * This script validates that Payload types are in sync with the collection definitions.
 * Run this in CI/CD to ensure types are always up-to-date.
 */

import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("type-validation");

async function validateTypes() {
  console.log("🔍 Validating Payload types are in sync...");
  logger.info("Starting type validation process");

  const typesFile = "./payload-types.ts";
  const backupFile = "./payload-types.backup.ts";

  try {
    // Backup current types
    if (fs.existsSync(typesFile)) {
      fs.copyFileSync(typesFile, backupFile);
    }

    // Generate fresh types
    logger.debug("Generating fresh types");
    execSync("payload generate:types", { stdio: "pipe" }); // Suppress command output

    // Compare with backup
    if (fs.existsSync(backupFile)) {
      const originalContent = fs.readFileSync(backupFile, "utf8");
      const newContent = fs.readFileSync(typesFile, "utf8");

      if (originalContent !== newContent) {
        logger.error("Types are out of sync with collection definitions");
        console.error("❌ Types are out of sync!");
        console.error('Run "pnpm payload:generate" to update types.');
        process.exit(1);
      }
    }

    console.log("✅ Types are in sync!");
    logger.info("Type validation completed successfully");

    // Cleanup
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
  } catch (error) {
    logError(error, "Type validation failed");
    console.error("❌ Type validation failed");

    // Restore backup if it exists
    if (fs.existsSync(backupFile)) {
      logger.info("Restoring backup types file");
      fs.copyFileSync(backupFile, typesFile);
      fs.unlinkSync(backupFile);
    }

    process.exit(1);
  }
}

validateTypes();
