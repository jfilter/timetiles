#!/usr/bin/env tsx

/**
 * Unified Payload Generation Script.
 *
 * This script generates all Payload-related files (types and database schema).
 * Neither generated file is formatted with oxfmt — they are left as raw
 * Payload output so they match what `payload migrate` auto-generates
 * (via typescript.autoGenerate) during CI. The only post-processing is
 * the circular foreign key fix on the schema file.
 *
 * @module
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { localBin } from "../../../scripts/shared/local-bin";
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

  // The AnyPgColumn annotations below make @ts-nocheck unnecessary.
  content = content.replaceAll(/\/\/ @ts-nocheck[^\n]*\n/g, "");

  // Annotate every .references() call: Payload orders tables differently on macOS
  // and Linux, so forward references can't be detected reliably.
  const refPattern = /\.references\(\s*\(\) => (\w+)\.id/g;
  let needsImport = false;
  const fixedContent = content.replace(refPattern, (_fullMatch, tableName) => {
    needsImport = true;
    return `.references((): AnyPgColumn => ${tableName}.id`;
  });

  let finalContent = fixedContent;
  if (needsImport && !finalContent.includes("AnyPgColumn")) {
    finalContent = finalContent.replace(
      /(from\s+["']@payloadcms\/db-postgres\/drizzle\/pg-core["'];?\n)/,
      `$1import { type AnyPgColumn } from "@payloadcms/db-postgres/drizzle/pg-core";\n`
    );
  }

  if (finalContent === content) {
    logger.debug(`No circular references found in ${filePath}`);
  } else {
    writeFileSync(fullPath, finalContent, "utf-8");
    logger.info(`Fixed circular foreign key references in ${filePath}`);
  }
};

const generate = () => {
  try {
    logger.info("🔄 Starting Payload file generation...");

    logger.info("📝 Generating TypeScript types...");
    execFileSync(localBin("payload"), ["generate:types"], { stdio: "pipe" });
    logger.info("✓ TypeScript types generated");

    logger.info("🗄️ Generating database schema...");
    execFileSync(localBin("payload"), ["generate:db-schema"], { stdio: "pipe" });
    logger.info("✓ Database schema generated");

    fixCircularReferences("payload-generated-schema.ts");

    logger.info("✅ Successfully generated all Payload files!");
    logger.info("Files updated: payload-types.ts, payload-generated-schema.ts");
  } catch (error) {
    logError(error, "Failed to generate Payload files");
    logger.info("❌ Generation failed. Please check the error above.");
    process.exit(1);
  }
};

generate();
