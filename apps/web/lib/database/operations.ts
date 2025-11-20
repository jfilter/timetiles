/**
 * Database operation utilities.
 *
 * Provides common database operations like querying, creating, dropping,
 * and managing connections. Auto-detects CI vs local environment.
 *
 * @module
 * @category Utils
 */

import { execSync } from "node:child_process";

import { createDatabaseClient } from "./client";
import { parseDatabaseUrl } from "./url";

/**
 * Options for database query execution
 */
export interface QueryOptions {
  /**
   * Description of the query (for logging)
   */
  description?: string;

  /**
   * Force shell-based execution instead of direct client
   * @default false
   */
  useShell?: boolean;

  /**
   * Return raw result instead of stringified
   * @default false
   */
  rawResult?: boolean;
}

/**
 * Execute a SQL query against a database.
 *
 * Auto-detects CI vs local environment and uses appropriate method:
 * - CI: Direct psql commands
 * - Local: Docker-based make commands (unless useShell is true)
 * - Direct client: Fastest, preferred method
 *
 * @param databaseName - Name of the database to query
 * @param sql - SQL query to execute
 * @param options - Query execution options
 * @returns Query result as string (or rows if rawResult=true)
 *
 * @example
 * ```typescript
 * // Check if database exists
 * const result = await executeDatabaseQuery(
 *   'postgres',
 *   "SELECT 1 FROM pg_database WHERE datname = 'my_db'",
 *   { description: 'Check database exists' }
 * );
 * ```
 */
export const executeDatabaseQuery = async (
  databaseName: string,
  sql: string,
  options: QueryOptions = {}
): Promise<string> => {
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  // Prefer direct client connection (faster, more reliable)
  if (!options.useShell && !isCI) {
    const client = createDatabaseClient({ database: databaseName });
    try {
      await client.connect();
      const result = await client.query(sql);

      if (options.rawResult) {
        return result.rows as unknown as string;
      }

      // Return formatted result similar to psql output
      if (result.rows.length === 0) {
        return "";
      }

      // For single column results, return just the values
      const firstRow = result.rows[0];
      const columns = Object.keys(firstRow ?? {});

      if (columns.length === 1 && columns[0]) {
        const columnName = columns[0];
        return result.rows.map((row) => String(row[columnName])).join("\n");
      }

      // For multi-column, return JSON
      return JSON.stringify(result.rows, null, 2);
    } finally {
      await client.end();
    }
  }

  // Fallback to shell-based execution
  return executeQueryViaShell(databaseName, sql, isCI, options.description);
};

/**
 * Execute SQL query via shell (psql or make command)
 *
 * @internal
 */
const executeQueryViaShell = (databaseName: string, sql: string, isCI: boolean, description?: string): string => {
  // Get connection parameters from environment
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { username, password, host } = parseDatabaseUrl(DATABASE_URL);

  let command: string;
  if (isCI) {
    // In CI, use direct psql commands
    command = `PGPASSWORD=${password} psql -h ${host} -U ${username} -d ${databaseName} -t -c "${sql}"`;
  } else {
    // Local development - use make commands with Docker
    // Escape SQL for shell
    const escapedSql = sql.replace(/"/g, '\\"');
    command = `cd ../.. && make db-query DB_NAME=${databaseName} SQL="${escapedSql}"`;
  }

  try {
    // eslint-disable-next-line sonarjs/os-command -- Safe database query execution
    const result = execSync(command, { stdio: "pipe", encoding: "utf8" });
    return result.trim();
  } catch (error) {
    if (description) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${description} failed: ${message}`);
    }
    throw error;
  }
};

/**
 * Terminate all connections to a database.
 *
 * Useful before dropping a database or resetting connections.
 *
 * @param databaseName - Name of the database
 *
 * @example
 * ```typescript
 * // Terminate all connections before dropping
 * await terminateConnections('timetiles_test_e2e');
 * await dropDatabase('timetiles_test_e2e');
 * ```
 */
export const terminateConnections = async (databaseName: string): Promise<void> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    await client.query(
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `,
      [databaseName]
    );
  } finally {
    await client.end();
  }
};

/**
 * Drop a database.
 *
 * Automatically terminates connections before dropping.
 *
 * @param databaseName - Name of the database to drop
 * @param options - Drop options
 *
 * @example
 * ```typescript
 * // Drop database with connection termination
 * await dropDatabase('timetiles_test_e2e');
 * ```
 */
export const dropDatabase = async (databaseName: string, options: { ifExists?: boolean } = {}): Promise<void> => {
  // Terminate connections first
  await terminateConnections(databaseName);

  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();

    const sql = options.ifExists ? `DROP DATABASE IF EXISTS "${databaseName}"` : `DROP DATABASE "${databaseName}"`;

    await client.query(sql);
  } finally {
    await client.end();
  }
};

/**
 * Create a database.
 *
 * @param databaseName - Name of the database to create
 * @param options - Creation options
 *
 * @example
 * ```typescript
 * // Create database, skip if exists
 * await createDatabase('timetiles_test_e2e', { ifNotExists: true });
 * ```
 */
export const createDatabase = async (databaseName: string, options: { ifNotExists?: boolean } = {}): Promise<void> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();

    const sql = options.ifNotExists
      ? `CREATE DATABASE "${databaseName}"`
      : `CREATE DATABASE IF NOT EXISTS "${databaseName}"`;

    await client.query(sql);
  } finally {
    await client.end();
  }
};

/**
 * Check if a database exists.
 *
 * @param databaseName - Name of the database to check
 * @returns True if database exists
 *
 * @example
 * ```typescript
 * if (await databaseExists('timetiles_test_e2e')) {
 *   console.log('Database exists');
 * }
 * ```
 */
export const databaseExists = async (databaseName: string): Promise<boolean> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    return result.rows.length > 0;
  } finally {
    await client.end();
  }
};

/**
 * Options for truncating tables
 */
export interface TruncateTablesOptions {
  /**
   * Schema to truncate tables from
   * @default 'payload'
   */
  schema?: string;

  /**
   * Table patterns to exclude (SQL LIKE patterns)
   * @default ['payload_migrations%']
   */
  excludePatterns?: string[];
}

/**
 * Truncate all tables in a schema.
 *
 * Useful for cleaning up test databases between test runs without dropping the entire database.
 * Handles foreign key constraints with CASCADE and resets identity sequences.
 *
 * @param connectionString - Database connection string
 * @param options - Truncation options
 *
 * @example
 * ```typescript
 * // Truncate all payload tables except migrations
 * await truncateTables('postgresql://user:pass@localhost:5432/timetiles_test');
 *
 * // Truncate with custom schema
 * await truncateTables(dbUrl, { schema: 'public' });
 *
 * // Exclude additional tables
 * await truncateTables(dbUrl, {
 *   schema: 'payload',
 *   excludePatterns: ['payload_migrations%', 'payload_preferences%']
 * });
 * ```
 */
export const truncateTables = async (
  connectionString: string,
  options: TruncateTablesOptions = {}
): Promise<number> => {
  const { schema = "payload", excludePatterns = ["payload_migrations%"] } = options;

  const client = createDatabaseClient({ connectionString });

  try {
    await client.connect();

    // Build WHERE clause for excluded patterns
    const excludeConditions = excludePatterns.map((_, index) => `table_name NOT LIKE $${index + 2}`).join(" AND ");

    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        ${excludeConditions ? `AND ${excludeConditions}` : ""}
      ORDER BY table_name
    `;

    const params = [schema, ...excludePatterns];
    const res = await client.query(query, params);

    const tableNames = res.rows.map((row) => row.table_name as string);

    if (tableNames.length > 0) {
      // Truncate all tables with CASCADE to handle foreign keys
      // Safe: table names are fetched from the database and properly escaped with double quotes
      const tableList = tableNames.map((name) => `${schema}."${name}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }

    return tableNames.length;
  } finally {
    await client.end();
  }
};
