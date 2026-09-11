/**
 * Database client factory utilities.
 *
 * Provides a centralized way to create PostgreSQL database clients
 * with consistent connection parameters across all test and setup scripts.
 *
 * @module
 * @category Utils
 */

import { Client } from "pg";

import { getEnv } from "@/lib/config/env";

import { withDatabaseName } from "./url";

/**
 * Options for creating a database client
 */
export interface DatabaseClientOptions {
  /**
   * Overrides the URL database. Defaults to postgres when using DATABASE_URL.
   */
  database?: string;

  /**
   * Full connection string; defaults to the current DATABASE_URL.
   */
  connectionString?: string;
}

/**
 * Create a PostgreSQL database client with standard connection parameters.
 *
 * This factory function provides a centralized way to create database clients,
 * eliminating hardcoded connection parameters throughout the codebase.
 *
 * @param options - Connection options
 * @returns Configured PostgreSQL client (not yet connected)
 *
 * @example
 * ```typescript
 * // Connect to default postgres database
 * const client = createDatabaseClient();
 * await client.connect();
 *
 * // Connect to specific database
 * const testClient = createDatabaseClient({ database: 'timetiles_test_e2e' });
 * await testClient.connect();
 *
 * // Use connection string
 * const urlClient = createDatabaseClient({
 *   connectionString: process.env.DATABASE_URL
 * });
 * await urlClient.connect();
 * ```
 */
export const createDatabaseClient = (options: DatabaseClientOptions = {}): Client => {
  let connectionString = options.connectionString ?? getEnv().DATABASE_URL;
  if (options.database !== undefined || options.connectionString === undefined) {
    connectionString = withDatabaseName(connectionString, options.database ?? "postgres");
  }
  return new Client({ connectionString });
};
