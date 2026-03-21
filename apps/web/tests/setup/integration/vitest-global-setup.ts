/**
 * Vitest global setup - runs ONCE before all workers.
 *
 * Creates a template database with all migrations applied that workers can clone.
 * This is much faster than each worker running migrations independently
 * (~2s clone vs ~30s migrations).
 *
 * @module
 * @category Test Setup
 */
import path from "node:path";

import dotenv from "dotenv";

// Load environment variables first
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createDatabaseClient } from "@/lib/database/client";
import { databaseExists, dropDatabase } from "@/lib/database/operations";
import { checkPostgreSQLConnection, setupDatabase } from "@/lib/database/setup";
import { constructDatabaseUrl, parseDatabaseUrl } from "@/lib/database/url";

import { verifyDatabaseSchema } from "./schema-verification";

const TEMPLATE_DB_NAME = "timetiles_test_template";

/**
 * Convert all payload tables to UNLOGGED for faster writes in test databases.
 *
 * UNLOGGED tables skip the Write-Ahead Log (WAL), making INSERT, UPDATE,
 * DELETE, and TRUNCATE significantly faster. Since test databases are
 * disposable, crash recovery is irrelevant.
 *
 * This is idempotent — already-unlogged tables are skipped.
 * Worker clones inherit UNLOGGED status from the template via CREATE DATABASE WITH TEMPLATE.
 */
const convertTablesToUnlogged = async (templateUrl: string): Promise<void> => {
  const client = createDatabaseClient({ connectionString: templateUrl });
  try {
    await client.connect();

    // Find all logged tables in the payload schema (excluding migrations)
    const result = await client.query(
      `SELECT c.relname as tablename
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'payload'
         AND c.relkind = 'r'
         AND c.relpersistence != 'u'
         AND c.relname NOT LIKE 'payload_migrations%'
       ORDER BY c.relname`
    );

    if (result.rows.length === 0) {
      console.log("[Global Setup] All tables already UNLOGGED");
      return;
    }

    // Multi-pass conversion: tables with FK dependencies must be converted
    // after the tables they reference. Retry failed tables until all succeed.
    let remaining = result.rows.map((r) => r.tablename as string);
    let pass = 0;
    const maxPasses = 5;

    while (remaining.length > 0 && pass < maxPasses) {
      pass++;
      const failed: string[] = [];

      for (const tableName of remaining) {
        try {
          await client.query(`ALTER TABLE payload."${tableName}" SET UNLOGGED`);
        } catch {
          failed.push(tableName);
        }
      }

      remaining = failed;
    }

    const converted = result.rows.length - remaining.length;
    if (remaining.length > 0) {
      console.warn(`[Global Setup] Could not convert ${remaining.length} tables to UNLOGGED:`, remaining);
    }
    console.log(`[Global Setup] Converted ${converted} tables to UNLOGGED (${pass} passes)`);
  } finally {
    await client.end();
  }
};

/**
 * Build connection URL for the template database.
 */
const buildTemplateUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const components = parseDatabaseUrl(baseUrl);
  return constructDatabaseUrl({ ...components, database: TEMPLATE_DB_NAME });
};

/**
 * Vitest global setup function.
 * Creates template database with migrations if needed.
 */
export const setup = async (): Promise<void> => {
  // Skip for unit tests - they don't need database
  if (process.argv.some((arg) => arg.includes("tests/unit"))) {
    return;
  }

  console.log("[Global Setup] Preparing template database for integration tests...");

  // Check PostgreSQL is running
  try {
    await checkPostgreSQLConnection();
  } catch (error) {
    console.error("[Global Setup] PostgreSQL not available:", error);
    throw error;
  }

  // Check if valid template already exists (fast path for repeated runs)
  if (await databaseExists(TEMPLATE_DB_NAME)) {
    try {
      await verifyDatabaseSchema(buildTemplateUrl());
      await convertTablesToUnlogged(buildTemplateUrl());
      console.log("[Global Setup] Template database ready (existing, schema valid)");
      return;
    } catch (error) {
      console.log("[Global Setup] Template schema outdated, recreating...", error);
      await dropDatabase(TEMPLATE_DB_NAME, { ifExists: true });
    }
  }

  // Create template with migrations
  console.log("[Global Setup] Creating template database with migrations...");
  await setupDatabase({
    databaseName: TEMPLATE_DB_NAME,
    enablePostGIS: true,
    createPayloadSchema: true,
    runMigrations: true,
    verbose: true,
  });

  // Verify the template was created correctly
  await verifyDatabaseSchema(buildTemplateUrl());

  // Convert tables to UNLOGGED for faster writes (no WAL overhead)
  await convertTablesToUnlogged(buildTemplateUrl());

  console.log("[Global Setup] Template database created successfully");
};

/**
 * Vitest global teardown function.
 * Leaves template for next run (faster startup).
 */
export const teardown = async (): Promise<void> => {
  // Intentionally empty - keep template for next test run
  // This is the key optimization: subsequent test runs reuse the template
  //
  // Note: Workers may segfault on exit due to open pg connections in forked
  // processes. This is cosmetic — all tests pass with exit code 0.
};
