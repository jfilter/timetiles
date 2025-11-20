/**
 * Database discovery utilities.
 *
 * Provides functions to discover and inspect databases,
 * particularly useful for test database management.
 *
 * @module
 * @category Utils
 */

import { createLogger } from "@/lib/logger";

import { createDatabaseClient } from "./client";

const logger = createLogger("db-discovery");

/**
 * Database metadata information
 */
export interface DatabaseInfo {
  /**
   * Database name
   */
  name: string;

  /**
   * Database exists
   */
  exists: boolean;

  /**
   * PostGIS extension is installed
   */
  hasPostGIS?: boolean;

  /**
   * Payload schema exists
   */
  hasPayloadSchema?: boolean;

  /**
   * Number of tables in payload schema
   */
  tableCount?: number;

  /**
   * Database size in bytes
   */
  size?: number;
}

/**
 * List all test databases matching a pattern.
 *
 * @param pattern - SQL LIKE pattern for database names
 * @returns Array of database names
 *
 * @example
 * ```typescript
 * // Find all test databases
 * const testDbs = await listTestDatabases();
 * // Returns: ['timetiles_test_e2e', 'timetiles_test_1', 'timetiles_test_2', ...]
 *
 * // Find worker databases only
 * const workerDbs = await listTestDatabases('timetiles_test_%');
 * ```
 */
export const listTestDatabases = async (pattern: string = "timetiles_test%"): Promise<string[]> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    const result = await client.query("SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname", [
      pattern,
    ]);
    return result.rows.map((row) => row.datname as string);
  } finally {
    await client.end();
  }
};

/**
 * Get detailed information about a database.
 *
 * @param databaseName - Name of the database
 * @returns Database metadata
 *
 * @example
 * ```typescript
 * const info = await getDatabaseInfo('timetiles_test_e2e');
 * console.log(`Database has ${info.tableCount} tables`);
 * console.log(`PostGIS installed: ${info.hasPostGIS}`);
 * ```
 */
export const getDatabaseInfo = async (databaseName: string): Promise<DatabaseInfo> => {
  const info: DatabaseInfo = {
    name: databaseName,
    exists: false,
  };

  // Check if database exists
  const postgresClient = createDatabaseClient({ database: "postgres" });
  try {
    await postgresClient.connect();
    const existsResult = await postgresClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    info.exists = existsResult.rows.length > 0;

    if (!info.exists) {
      return info;
    }

    // Get database size
    const sizeResult = await postgresClient.query("SELECT pg_database_size($1) as size", [databaseName]);
    info.size = parseInt(sizeResult.rows[0]?.size ?? "0");
  } finally {
    await postgresClient.end();
  }

  // If database exists, get more details by connecting to it
  if (info.exists) {
    const dbClient = createDatabaseClient({ database: databaseName });
    try {
      await dbClient.connect();

      // Check PostGIS extension
      const postgisResult = await dbClient.query(
        "SELECT COUNT(*) as count FROM pg_extension WHERE extname = 'postgis'"
      );
      info.hasPostGIS = parseInt(postgisResult.rows[0]?.count ?? "0") > 0;

      // Check payload schema
      const schemaResult = await dbClient.query(
        "SELECT COUNT(*) as count FROM information_schema.schemata WHERE schema_name = 'payload'"
      );
      info.hasPayloadSchema = parseInt(schemaResult.rows[0]?.count ?? "0") > 0;

      // Count tables in payload schema if it exists
      if (info.hasPayloadSchema) {
        const tableResult = await dbClient.query(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'payload'"
        );
        info.tableCount = parseInt(tableResult.rows[0]?.count ?? "0");
      }
    } catch (error) {
      // Database might not be accessible, return what we have
      logger.warn(`Could not access database ${databaseName}:`, error);
    } finally {
      await dbClient.end();
    }
  }

  return info;
};

/**
 * List all test databases with their metadata.
 *
 * @param pattern - SQL LIKE pattern for database names
 * @returns Array of database metadata
 *
 * @example
 * ```typescript
 * const databases = await listTestDatabasesWithInfo();
 * databases.forEach(db => {
 *   console.log(`${db.name}: ${db.tableCount} tables, ${db.size} bytes`);
 * });
 * ```
 */
export const listTestDatabasesWithInfo = async (pattern: string = "timetiles_test%"): Promise<DatabaseInfo[]> => {
  const names = await listTestDatabases(pattern);
  return Promise.all(names.map((name) => getDatabaseInfo(name)));
};
