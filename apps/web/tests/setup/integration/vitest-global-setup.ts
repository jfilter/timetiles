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

import { databaseExists, dropDatabase } from "@/lib/database/operations";
import { checkPostgreSQLConnection, setupDatabase } from "@/lib/database/setup";
import { constructDatabaseUrl, parseDatabaseUrl } from "@/lib/database/url";

import { verifyDatabaseSchema } from "./schema-verification";

const TEMPLATE_DB_NAME = "timetiles_test_template";

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

  console.log("[Global Setup] Template database created successfully");
};

/**
 * Vitest global teardown function.
 * Leaves template for next run (faster startup).
 */
export const teardown = async (): Promise<void> => {
  // Intentionally empty - keep template for next test run
  // This is the key optimization: subsequent test runs reuse the template
};
