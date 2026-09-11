/**
 * Database operation utilities.
 *
 * Provides common database operations through the shared PostgreSQL client
 * in both local and CI environments.
 *
 * @module
 * @category Utils
 */

import { createDatabaseClient } from "./client";

export interface QueryOptions {
  /** Connection settings for tooling that targets a separate database. */
  connectionString?: string;
}

/**
 * Execute a SQL query through the shared PostgreSQL client.
 *
 * The database argument selects the target, including when a connection URL
 * points to another database. Single-column results are newline-separated;
 * multi-column results are JSON. Empty results return an empty string.
 */
export const executeDatabaseQuery = async (
  databaseName: string,
  sql: string,
  options: QueryOptions = {}
): Promise<string> => {
  const client = createDatabaseClient({ connectionString: options.connectionString, database: databaseName });
  try {
    await client.connect();
    const result = await client.query(sql);

    if (result.rows.length === 0) return "";

    const columns = Object.keys(result.rows[0] ?? {});
    if (columns.length === 1 && columns[0]) {
      const columnName = columns[0];
      return result.rows.map((row) => String(row[columnName])).join("\n");
    }

    return JSON.stringify(result.rows, null, 2);
  } finally {
    await client.end();
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

/** SQLSTATE for a backend killed by pg_terminate_backend. */
const ADMIN_SHUTDOWN = "57P01";

const isOwnTermination = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: string; message?: string };
  return code === ADMIN_SHUTDOWN || (message ?? "").includes("terminating connection due to administrator command");
};

/**
 * Swallow the fallout of our own `pg_terminate_backend`, and only that.
 *
 * `dropDatabase` deliberately kills every backend on the target database. A `pg.Pool` with an
 * idle client there raises the resulting 57P01 as an `error` EVENT, and a pool without a
 * listener turns that into an unhandled exception — killing the process. That is exactly what
 * happened in the Playwright teardown: every test passed, then the runner died mid-cleanup
 * and reported failure. Anything that is not our own termination stays fatal.
 */
const toleratingOwnTerminations = async <T>(run: () => Promise<T>): Promise<T> => {
  const onUncaught = (error: unknown): void => {
    if (isOwnTermination(error)) return;
    throw error;
  };

  process.on("uncaughtException", onUncaught);
  try {
    return await run();
  } finally {
    process.off("uncaughtException", onUncaught);
  }
};

/**
 * Drop a database.
 *
 * Terminates connections by default. Disable this for opportunistic cleanup:
 * PostgreSQL then rejects databases that are still in use.
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
export const dropDatabase = async (
  databaseName: string,
  options: { ifExists?: boolean; terminateConnections?: boolean } = {}
): Promise<void> =>
  toleratingOwnTerminations(async () => {
    if (options.terminateConnections !== false) await terminateConnections(databaseName);

    const client = createDatabaseClient({ database: "postgres" });
    try {
      await client.connect();

      const sql = options.ifExists ? `DROP DATABASE IF EXISTS "${databaseName}"` : `DROP DATABASE "${databaseName}"`;

      await client.query(sql);
    } finally {
      await client.end();
    }
  });

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
  // PostgreSQL has no native `CREATE DATABASE IF NOT EXISTS`, so guard with an
  // existence check when ifNotExists is requested.
  if (options.ifNotExists && (await databaseExists(databaseName))) {
    return;
  }

  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${databaseName}"`);
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
 * List non-template databases matching a prefix.
 *
 * @param prefix - Database name prefix to match
 * @returns Matching database names ordered alphabetically
 */
export const listDatabasesByPrefix = async (prefix: string): Promise<string[]> => {
  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    const result = await client.query<{ datname: string }>(
      `
        SELECT datname
        FROM pg_database
        WHERE datistemplate = false
          AND starts_with(datname, $1)
        ORDER BY datname
      `,
      [prefix]
    );

    return result.rows.map((row) => row.datname);
  } finally {
    await client.end();
  }
};

/**
 * Clone a database from a template.
 *
 * Creates a new database as a copy of an existing template database.
 * This is much faster than running migrations (~2s vs ~30s) for test setup.
 *
 * Note: Terminates connections to the template before cloning, as PostgreSQL
 * requires no active connections to the template database.
 *
 * @param templateName - Name of the template database to clone from
 * @param newName - Name of the new database to create
 *
 * @example
 * ```typescript
 * // Clone a template database for a test worker
 * await cloneDatabase('timetiles_test_e2e_template', 'timetiles_test_e2e_0');
 * ```
 */
export const cloneDatabase = async (templateName: string, newName: string): Promise<void> => {
  // PostgreSQL requires no active connections to the template
  await terminateConnections(templateName);

  const client = createDatabaseClient({ database: "postgres" });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${newName}" WITH TEMPLATE "${templateName}"`);
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
      // Set lock_timeout to fail fast instead of deadlocking with
      // idle-in-transaction connections from Payload's pool. Session-level
      // (not SET LOCAL): outside a transaction block SET LOCAL is a no-op,
      // and this dedicated connection is closed right after.
      await client.query(`SET lock_timeout = '10s'`);
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }

    return tableNames.length;
  } finally {
    await client.end();
  }
};
