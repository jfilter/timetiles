/**
 * Database setup utilities.
 *
 * Provides generic database setup functions that work for both E2E and
 * unit/integration test databases, eliminating duplication across scripts.
 *
 * @module
 * @category Utils
 */

import { execSync } from "node:child_process";

import { createLogger } from "../logger";
import { createDatabaseClient } from "./client";
import { createDatabase, databaseExists, dropDatabase } from "./operations";
import { constructDatabaseUrl, parseDatabaseUrl } from "./url";

const logger = createLogger("database-setup");

/**
 * Check if PostgreSQL server is running and accessible.
 *
 * @throws Error with helpful message if PostgreSQL is not accessible
 *
 * @example
 * ```typescript
 * await checkPostgreSQLConnection();
 * ```
 */
export const checkPostgreSQLConnection = async (): Promise<void> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    await client.end();
  } catch (error) {
    const isConnectionRefused =
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") || error.message.includes("connect ECONNREFUSED"));

    if (isConnectionRefused) {
      throw new Error(
        `❌ PostgreSQL is not running!\n\n` +
          `Integration tests require a PostgreSQL database.\n\n` +
          `To start PostgreSQL:\n` +
          `  • Run: make dev (starts DB + dev server)\n` +
          `  • Or: docker compose up -d db\n\n` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  }
};

/**
 * Options for database setup
 */
export interface DatabaseSetupOptions {
  /**
   * Name of the database to create
   */
  databaseName: string;

  /**
   * Full connection string (alternative to databaseName)
   */
  connectionString?: string;

  /**
   * Enable PostGIS extension
   * @default true
   */
  enablePostGIS?: boolean;

  /**
   * Create payload schema
   * @default true
   */
  createPayloadSchema?: boolean;

  /**
   * Run Payload migrations
   * @default true
   */
  runMigrations?: boolean;

  /**
   * Drop database if it exists before creating
   * @default false
   */
  dropIfExists?: boolean;

  /**
   * Skip if database already exists and is valid
   * @default true
   */
  skipIfExists?: boolean;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

/**
 * Enable PostGIS extension and topology in a database.
 *
 * @param databaseName - Name of the database
 *
 * @example
 * ```typescript
 * await enablePostGIS('timetiles_test_e2e');
 * ```
 */
export const enablePostGIS = async (databaseName: string): Promise<void> => {
  const client = createDatabaseClient({ database: databaseName });
  try {
    await client.connect();

    // Create PostGIS extension
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis");

    // Create PostGIS topology extension
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis_topology");

    logger.debug(`PostGIS enabled for database: ${databaseName}`);
  } finally {
    await client.end();
  }
};

/**
 * Create payload schema in a database.
 *
 * @param databaseName - Name of the database
 *
 * @example
 * ```typescript
 * await createPayloadSchema('timetiles_test_e2e');
 * ```
 */
export const createPayloadSchema = async (databaseName: string): Promise<void> => {
  const client = createDatabaseClient({ database: databaseName });
  try {
    await client.connect();
    await client.query("CREATE SCHEMA IF NOT EXISTS payload");
    logger.debug(`Payload schema created for database: ${databaseName}`);
  } finally {
    await client.end();
  }
};

/**
 * Run Payload migrations on a database.
 *
 * @param connectionString - Database connection string
 *
 * @example
 * ```typescript
 * await runMigrations('postgresql://user:pass@localhost:5432/timetiles_test_e2e');
 * ```
 */
export const runMigrations = (connectionString: string): void => {
  try {
    logger.info("Running Payload migrations...");

    // eslint-disable-next-line sonarjs/os-command -- Safe migration execution
    execSync(`DATABASE_URL="${connectionString}" pnpm payload migrate`, {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
      },
    });

    logger.info("Migrations completed successfully");
  } catch (error) {
    logger.error("Migration failed:", error);
    throw new Error(`Failed to run migrations: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Setup a database with standard configuration.
 *
 * This is a generic function that handles database creation, PostGIS setup,
 * schema creation, and migrations. It works for both E2E and worker databases.
 *
 * @param options - Database setup options
 *
 * @example
 * ```typescript
 * // Setup E2E database
 * await setupDatabase({
 *   databaseName: 'timetiles_test_e2e',
 *   enablePostGIS: true,
 *   createPayloadSchema: true,
 *   runMigrations: true,
 * });
 *
 * // Setup worker database (quick setup)
 * await setupDatabase({
 *   databaseName: 'timetiles_test_1',
 *   enablePostGIS: true,
 *   createPayloadSchema: true,
 *   runMigrations: true,
 *   skipIfExists: true, // Skip if already set up
 * });
 *
 * // Reset database (drop and recreate)
 * await setupDatabase({
 *   databaseName: 'timetiles_test_e2e',
 *   dropIfExists: true,
 *   enablePostGIS: true,
 *   createPayloadSchema: true,
 *   runMigrations: true,
 * });
 * ```
 */
// Helper to resolve database name and connection string
const resolveDatabaseConnection = (
  databaseName: string,
  connectionString?: string
): { dbName: string; connString: string } => {
  if (connectionString) {
    const parsed = parseDatabaseUrl(connectionString);
    return { dbName: parsed.database, connString: connectionString };
  }

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const baseComponents = parseDatabaseUrl(baseUrl);
  const connString = constructDatabaseUrl({
    ...baseComponents,
    database: databaseName,
  });

  return { dbName: databaseName, connString };
};

// Helper to log if verbose mode is enabled
const logVerbose = (verbose: boolean, message: string): void => {
  if (verbose) {
    logger.info(message);
  }
};

// Helper to handle existing database check
const shouldSkipSetup = async (
  dbName: string,
  skipIfExists: boolean,
  dropIfExists: boolean,
  verbose: boolean
): Promise<boolean> => {
  const exists = await databaseExists(dbName);

  if (exists && skipIfExists && !dropIfExists) {
    logVerbose(verbose, `Database ${dbName} already exists, skipping setup`);
    return true;
  }

  // Drop database if it exists and dropIfExists is true
  if (dropIfExists && exists) {
    logVerbose(verbose, `Dropping existing database: ${dbName}`);
    await dropDatabase(dbName, { ifExists: true });
  }

  return false;
};

export const setupDatabase = async (options: DatabaseSetupOptions): Promise<void> => {
  const {
    databaseName,
    connectionString,
    enablePostGIS: enablePostGISOption = true,
    createPayloadSchema: createPayloadSchemaOption = true,
    runMigrations: runMigrationsOption = true,
    dropIfExists = false,
    skipIfExists = true,
    verbose = false,
  } = options;

  logVerbose(verbose, `Setting up database: ${databaseName}`);

  // Resolve database name and connection string
  const { dbName, connString } = resolveDatabaseConnection(databaseName, connectionString);

  // Check if we should skip setup
  const skip = await shouldSkipSetup(dbName, skipIfExists, dropIfExists, verbose);
  if (skip) return;

  // Create database
  logVerbose(verbose, `Creating database: ${dbName}`);
  await createDatabase(dbName, { ifNotExists: true });

  // Enable PostGIS if requested
  if (enablePostGISOption) {
    logVerbose(verbose, "Enabling PostGIS extension...");
    await enablePostGIS(dbName);
  }

  // Create payload schema if requested
  if (createPayloadSchemaOption) {
    logVerbose(verbose, "Creating payload schema...");
    await createPayloadSchema(dbName);
  }

  // Run migrations if requested
  if (runMigrationsOption) {
    logVerbose(verbose, "Running migrations...");
    runMigrations(connString);
  }

  logVerbose(verbose, `✓ Database ${dbName} setup completed`);
};
