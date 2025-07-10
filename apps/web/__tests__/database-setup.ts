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
