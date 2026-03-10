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
 * Fix circular foreign key references in the generated Drizzle schema.
 *
 * Payload's schema generator doesn't handle circular table references —
 * when two tables reference each other via foreign keys, TypeScript can't
 * infer types and emits TS7022/TS7024 errors. The Drizzle-documented fix
 * is to annotate the return type of `.references()` with `AnyPgColumn`
 * on at least one side of the cycle.
 *
 * This function:
 * 1. Adds `AnyPgColumn` to the import from drizzle/pg-core
 * 2. Finds `.references(() => ...)` calls that reference forward-declared tables
 *    (tables defined later in the file) and annotates them with `(): AnyPgColumn =>`
 */
const fixCircularReferences = (filePath: string) => {
  const fullPath = join(process.cwd(), filePath);
  let content = readFileSync(fullPath, "utf-8");

  // Remove any existing @ts-nocheck (no longer needed with proper fix)
  content = content.replace(/\/\/ @ts-nocheck[^\n]*\n/g, "");

  // Step 1: Collect table definition order
  const tablePattern = /export const (\w+) = db_schema\.table\(/g;
  const tableOrder: string[] = [];
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    tableOrder.push(match[1]!);
  }

  // Step 2: For each .references(() => tableName.id, ...) call,
  // check if tableName is defined AFTER the current position (forward reference).
  // If so, annotate the arrow function with (): AnyPgColumn =>
  let needsImport = false;
  const refPattern = /\.references\(\(\) => (\w+)\.id/g;
  const fixedContent = content.replace(refPattern, (fullMatch, tableName, offset) => {
    // Find which table this reference is inside of
    let currentTable = "";
    for (const table of tableOrder) {
      const tableDefPos = content.indexOf(`export const ${table} = db_schema.table(`);
      if (tableDefPos <= offset) {
        currentTable = table;
      }
    }

    // Find position of the referenced table
    const refTablePos = content.indexOf(`export const ${tableName} = db_schema.table(`);
    const currentTablePos = content.indexOf(`export const ${currentTable} = db_schema.table(`);

    // If referenced table is defined after current table, it's a forward reference
    if (refTablePos > currentTablePos) {
      needsImport = true;
      return `.references((): AnyPgColumn => ${tableName}.id`;
    }
    return fullMatch;
  });

  // Step 3: Add AnyPgColumn import if needed
  let finalContent = fixedContent;
  if (needsImport && !finalContent.includes("import { type AnyPgColumn }")) {
    // Add a separate type import after the existing pg-core import
    finalContent = finalContent.replace(
      /(from\s+["']@payloadcms\/db-postgres\/drizzle\/pg-core["'];?\n)/,
      `$1import { type AnyPgColumn } from "@payloadcms/db-postgres/drizzle/pg-core";\n`
    );
  }

  if (finalContent !== content) {
    writeFileSync(fullPath, finalContent, "utf-8");
    logger.info(`Fixed circular foreign key references in ${filePath}`);
  } else {
    logger.debug(`No circular references found in ${filePath}`);
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

    // Format both generated files
    logger.info("✨ Formatting generated files...");
    execSync("pnpm exec oxfmt --write payload-types.ts payload-generated-schema.ts", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    logger.info("✓ Files formatted");

    // Fix circular foreign key references AFTER formatting (formatter merges duplicate imports)
    fixCircularReferences("payload-generated-schema.ts");

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
