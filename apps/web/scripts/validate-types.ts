#!/usr/bin/env tsx

/**
 * Payload Generated Files Validation Script.
 *
 * This script validates that Payload-generated types and database schema are in sync
 * with the collection definitions. Run this in CI/CD to ensure generated files are always up-to-date.
 *
 * @module
 * @category Scripts
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("payload-validation");

const validateFile = (committedFile: string, backupFile: string, label: string): boolean => {
  if (!fs.existsSync(backupFile)) return false;
  const original = fs.readFileSync(backupFile, "utf8");
  const generated = fs.readFileSync(committedFile, "utf8");
  if (original !== generated) {
    logger.error(`${label} are out of sync with collection definitions`);
    const origLines = original.split("\n");
    const genLines = generated.split("\n");
    logger.error(`Line count: committed=${origLines.length}, generated=${genLines.length}`);
    for (let i = 0; i < Math.min(origLines.length, genLines.length); i++) {
      if (origLines[i] !== genLines[i]) {
        logger.error(`First diff at line ${i + 1}:`);
        logger.error(`  committed: ${origLines[i]?.substring(0, 120)}`);
        logger.error(`  generated: ${genLines[i]?.substring(0, 120)}`);
        break;
      }
    }
    return true;
  }
  return false;
};

const validateTypes = () => {
  logger.info("🔍 Validating Payload generated files are in sync...");

  const typesFile = "./payload-types.ts";
  const typesBackupFile = "./payload-types.backup.ts";
  const schemaFile = "./payload-generated-schema.ts";
  const schemaBackupFile = "./payload-generated-schema.backup.ts";

  try {
    // Backup current files
    if (fs.existsSync(typesFile)) fs.copyFileSync(typesFile, typesBackupFile);
    if (fs.existsSync(schemaFile)) fs.copyFileSync(schemaFile, schemaBackupFile);

    // Generate fresh files
    execSync("tsx scripts/generate-payload.ts", { stdio: "pipe" });

    // Compare files with backups
    const typesChanged = validateFile(typesFile, typesBackupFile, "Types");
    const schemaChanged = validateFile(schemaFile, schemaBackupFile, "Database schema");

    if (typesChanged || schemaChanged) {
      logger.error("❌ Generated files are out of sync!");
      logger.error('Run "pnpm payload:generate" to update files.');
      process.exit(1);
    }

    logger.info("✅ Generated files are in sync!");

    // Cleanup
    if (fs.existsSync(typesBackupFile)) fs.unlinkSync(typesBackupFile);
    if (fs.existsSync(schemaBackupFile)) fs.unlinkSync(schemaBackupFile);
  } catch (error) {
    logError(error, "Validation failed");
    logger.error("❌ Validation failed");

    // Restore backups
    if (fs.existsSync(typesBackupFile)) {
      fs.copyFileSync(typesBackupFile, typesFile);
      fs.unlinkSync(typesBackupFile);
    }
    if (fs.existsSync(schemaBackupFile)) {
      fs.copyFileSync(schemaBackupFile, schemaFile);
      fs.unlinkSync(schemaBackupFile);
    }

    process.exit(1);
  }
};

validateTypes();
