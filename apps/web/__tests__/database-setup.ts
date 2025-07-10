import { Client } from "pg";
import { createLogger } from "../lib/logger";

const logger = createLogger("database-setup");

/**
 * Creates isolated test database for each worker
 */
export async function createTestDatabase(dbName: string): Promise<void> {
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "timetiles_user",
    password: "timetiles_password",
    database: "postgres", // Connect to default database first
  });

  try {
    await client.connect();

    // In CI, try to use pre-created worker databases first
    if (process.env.CI) {
      const workerId = process.env.VITEST_WORKER_ID || "1";
      const ciDbName = `timetiles_test_${workerId}`;

      // Check if the CI worker database exists
      const result = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [ciDbName],
      );

      if (result.rows.length > 0) {
        logger.debug(`Using existing CI database: ${ciDbName}`);
        return; // Use the existing database, don't create a new one
      }
    }

    // Drop database if it exists
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);

    // Create new database
    await client.query(`CREATE DATABASE "${dbName}"`);

    logger.debug(`Created test database: ${dbName}`);
  } catch (error) {
    logger.error(
      { err: error, dbName },
      `Failed to create test database ${dbName}`,
    );

    // In CI, if database creation fails, try to use main test database
    if (process.env.CI) {
      logger.warn(`Falling back to main test database due to creation failure`);
      return; // Don't throw, let tests use fallback database
    }

    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Cleans up test database
 */
export async function dropTestDatabase(dbName: string): Promise<void> {
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "timetiles_user",
    password: "timetiles_password",
    database: "postgres",
  });

  try {
    await client.connect();

    // Force close all connections to the database
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${dbName}'
        AND pid <> pg_backend_pid()
    `);

    // Drop database
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);

    logger.debug(`Dropped test database: ${dbName}`);
  } catch (error) {
    logger.warn(
      { err: error, dbName },
      `Failed to drop test database ${dbName}`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Extract database name from connection URL
 */
export function getDatabaseName(url: string): string {
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match?.[1] || "timetiles_test";
}
