/**
 * Database connectivity check for integration tests.
 *
 * This module provides utilities to check if PostgreSQL is running
 * before attempting to run integration tests. If the database is not
 * available, integration tests will be skipped with a helpful message.
 *
 * @module
 * @category Testing
 */
import { Client } from "pg";

/**
 * Checks if PostgreSQL database is available
 */
export const isDatabaseAvailable = async (): Promise<boolean> => {
  const dbUrl =
    process.env.DATABASE_URL || "postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test";

  try {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Skip test if database is not available
 */
export const skipIfNoDatabase = async (testName?: string): Promise<void> => {
  const isAvailable = await isDatabaseAvailable();

  if (!isAvailable) {
    const message = testName
      ? `Skipping ${testName}: PostgreSQL is not running. Run 'make dev' to start the database.`
      : "Skipping test: PostgreSQL is not running. Run 'make dev' to start the database.";

    console.warn(`\n⚠️  ${message}\n`);

    // Use Vitest's skip functionality
    if (typeof test !== "undefined" && test.skip) {
      test.skip(message, () => {});
    }
  }
};
