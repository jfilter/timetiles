#!/usr/bin/env tsx

/**
 * Payload Generated Files Validation Script
 *
 * This script validates that Payload-generated types and database schema are in sync
 * with the collection definitions. Run this in CI/CD to ensure generated files are always up-to-date.
 */

import { execSync } from "child_process";
import fs from "fs";

import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("payload-validation");

const validateTypes = () => {
  logger.info("🔍 Validating Payload generated files are in sync...");
  logger.info("Starting validation process for types and schema");

  const typesFile = "./payload-types.ts";
  const typesBackupFile = "./payload-types.backup.ts";
  const schemaFile = "./payload-generated-schema.ts";
  const schemaBackupFile = "./payload-generated-schema.backup.ts";

  try {
    // Backup current files
    if (fs.existsSync(typesFile)) {
      fs.copyFileSync(typesFile, typesBackupFile);
    }
    if (fs.existsSync(schemaFile)) {
      fs.copyFileSync(schemaFile, schemaBackupFile);
    }

    // Generate fresh files using the unified generation script
    logger.debug("Generating fresh types and schema");
    execSync("tsx scripts/generate-payload.ts", { stdio: "pipe" }); // Suppress command output

    // Compare files with backups
    let hasChanges = false;

    // Check types
    if (fs.existsSync(typesBackupFile)) {
      const originalTypesContent = fs.readFileSync(typesBackupFile, "utf8");
      const newTypesContent = fs.readFileSync(typesFile, "utf8");

      if (originalTypesContent !== newTypesContent) {
        logger.error("Types are out of sync with collection definitions");
        hasChanges = true;
      }
    }

    // Check schema
    if (fs.existsSync(schemaBackupFile)) {
      const originalSchemaContent = fs.readFileSync(schemaBackupFile, "utf8");
      const newSchemaContent = fs.readFileSync(schemaFile, "utf8");

      if (originalSchemaContent !== newSchemaContent) {
        logger.error("Database schema is out of sync with collection definitions");
        hasChanges = true;
      }
    }

    if (hasChanges) {
      logger.error("❌ Generated files are out of sync!");
      logger.error('Run "pnpm payload:generate" and "pnpm payload:generate-schema" to update files.');
      process.exit(1);
    }

    logger.info("✅ Generated files are in sync!");
    logger.info("Validation completed successfully");

    // Cleanup
    if (fs.existsSync(typesBackupFile)) {
      fs.unlinkSync(typesBackupFile);
    }
    if (fs.existsSync(schemaBackupFile)) {
      fs.unlinkSync(schemaBackupFile);
    }
  } catch (error) {
    logError(error, "Validation failed");
    logger.error("❌ Validation failed");

    // Restore backups if they exist
    if (fs.existsSync(typesBackupFile)) {
      logger.info("Restoring backup types file");
      fs.copyFileSync(typesBackupFile, typesFile);
      fs.unlinkSync(typesBackupFile);
    }
    if (fs.existsSync(schemaBackupFile)) {
      logger.info("Restoring backup schema file");
      fs.copyFileSync(schemaBackupFile, schemaFile);
      fs.unlinkSync(schemaBackupFile);
    }

    process.exit(1);
  }
};

validateTypes();
