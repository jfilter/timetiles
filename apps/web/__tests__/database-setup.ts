import { Client } from "pg";
import { logger } from "../lib/logger";

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

    // Check if database already exists
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );

    if (result.rows.length === 0) {
      // Create new database
      await client.query(`CREATE DATABASE "${dbName}"`);
      logger.debug(`Created test database: ${dbName}`);
    } else {
      logger.debug(`Test database already exists: ${dbName}`);
    }
  } catch (error) {
    logger.error(
      { err: error, dbName },
      `Failed to create or check test database ${dbName}`,
    );
    throw error;
  } finally {
    await client.end();
  }

  // Now connect to the target database and set up the schema
  const targetClient = new Client({
    host: "localhost",
    port: 5432,
    user: "timetiles_user",
    password: "timetiles_password",
    database: dbName,
  });

  try {
    await targetClient.connect();
    
    // Create PostGIS extension if it doesn't exist
    await targetClient.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    logger.debug(`Ensured PostGIS extension in test database: ${dbName}`);
    
  } catch (error) {
    logger.warn(`Failed to set up PostGIS extension in ${dbName}: ${(error as Error).message}`);
    throw error;
  } finally {
    await targetClient.end();
  }
}

/**
 * Truncates all tables in the test database
 */
export async function truncateAllTables(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();

    // Get all table names in the public schema
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);

    const tableNames = res.rows.map((row) => row.table_name);

    if (tableNames.length > 0) {
      // Truncate all tables
      await client.query(
        `TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
      );
      logger.debug("Truncated all tables in the test database");
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to truncate tables");
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
