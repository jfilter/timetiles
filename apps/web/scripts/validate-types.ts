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

import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { localBin } from "../../../scripts/shared/local-bin";
import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("payload-validation");

const GENERATED_FILES = [
  { file: "./payload-types.ts", label: "Types" },
  { file: "./payload-generated-schema.ts", label: "Database schema" },
];

const reportFirstDiff = (committed: string, generated: string) => {
  const committedLines = committed.split("\n");
  const generatedLines = generated.split("\n");
  logger.error(`Line count: committed=${committedLines.length}, generated=${generatedLines.length}`);
  const line = committedLines.findIndex((text, i) => text !== generatedLines[i]);
  if (line === -1) return;
  logger.error(`First diff at line ${line + 1}:`);
  logger.error(`  committed: ${committedLines[line]?.substring(0, 120)}`);
  logger.error(`  generated: ${generatedLines[line]?.substring(0, 120)}`);
};

/**
 * Regenerate the files, name the ones that differ from their committed content, and put
 * the committed content back either way, so validating never rewrites the working tree.
 */
export const findOutOfSyncFiles = (generate: () => void, files = GENERATED_FILES): string[] => {
  const committed = files.map(({ file }) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined));
  try {
    generate();
    return files
      .filter(({ file, label }, i) => {
        const generated = fs.readFileSync(file, "utf8");
        const before = committed[i];
        if (before === generated) return false;
        logger.error(`${label} are out of sync with collection definitions`);
        if (before === undefined) logger.error(`${file} is not committed`);
        else reportFirstDiff(before, generated);
        return true;
      })
      .map(({ file }) => file);
  } finally {
    files.forEach(({ file }, i) => {
      const content = committed[i];
      if (content === undefined) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, content);
    });
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info("🔍 Validating Payload generated files are in sync...");
  try {
    const outOfSync = findOutOfSyncFiles(() =>
      execFileSync(localBin("tsx"), ["scripts/generate-payload.ts"], { stdio: "pipe" })
    );
    if (outOfSync.length > 0) {
      logger.error("❌ Generated files are out of sync!");
      logger.error('Run "pnpm payload:generate" to update files.');
      process.exit(1);
    }
    logger.info("✅ Generated files are in sync!");
  } catch (error) {
    logError(error, "Validation failed");
    process.exit(1);
  }
}
