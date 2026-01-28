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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createLogger, logError } from "../lib/logger.js";

const logger = createLogger("payload-generate");

/**
 * Add @ts-nocheck directive to the top of the generated schema file.
 * This is needed because the generated file contains circular type references
 * that cause TypeScript errors but are unavoidable in the generated schema.
 */
const addTsNoCheck = (filePath: string) => {
  const fullPath = join(process.cwd(), filePath);
  const content = readFileSync(fullPath, "utf-8");

  // Only add if not already present
  if (!content.startsWith("// @ts-nocheck")) {
    const updatedContent = `// @ts-nocheck\n${content}`;
    writeFileSync(fullPath, updatedContent, "utf-8");
    logger.debug(`Added @ts-nocheck to ${filePath}`);
  }
};

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

    // Add @ts-nocheck to schema file to handle circular type references
    addTsNoCheck("payload-generated-schema.ts");

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
