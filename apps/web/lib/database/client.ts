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

import { parseDatabaseUrl } from "./url";

/** Cached defaults parsed from DATABASE_URL */
let _envDefaults: { host: string; port: number; user: string; password: string } | null = null;

/** Parse DATABASE_URL once and cache the result for use as connection defaults */
const getEnvDefaults = () => {
  const databaseUrl = getEnv().DATABASE_URL;
  if (!_envDefaults && databaseUrl) {
    try {
      const parsed = parseDatabaseUrl(databaseUrl);
      _envDefaults = {
        host: parsed.host,
        port: Number.parseInt(parsed.port, 10),
        user: parsed.username,
        password: parsed.password,
      };
    } catch {
      // Invalid URL, fall through to hardcoded defaults
    }
  }
  return _envDefaults;
};

/**
 * Options for creating a database client
 */
export interface DatabaseClientOptions {
  /**
   * Specific database name to connect to
   * @default "postgres"
   */
  database?: string;

  /**
   * Full connection string (overrides individual parameters)
   */
  connectionString?: string;

  /**
   * Database host
   * @default "localhost"
   */
  host?: string;

  /**
   * Database port
   * @default 5432
   */
  port?: number;

  /**
   * Database user
   * @default "timetiles_user"
   */
  user?: string;

  /**
   * Database password
   * @default "timetiles_password"
   */
  password?: string;
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
  // If connection string provided, use it directly
  if (options.connectionString) {
    return new Client({ connectionString: options.connectionString });
  }

  // Otherwise, use individual parameters with defaults derived from DATABASE_URL
  const env = getEnvDefaults();
  return new Client({
    host: options.host ?? env?.host ?? "localhost",
    port: options.port ?? env?.port ?? 5432,
    user: options.user ?? env?.user ?? "timetiles_user",
    password: options.password ?? env?.password ?? "timetiles_password",
    database: options.database ?? "postgres",
  });
};
