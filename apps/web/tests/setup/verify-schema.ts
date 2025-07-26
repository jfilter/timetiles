import { Client } from "pg";

/**
 * Verifies that the database schema has been properly set up with all required tables
 */
export const verifyDatabaseSchema = async (connectionString: string): Promise<void> => {
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Check search_path
    await client.query("SHOW search_path");

    // Check if payload schema exists
    const schemaResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'payload'
    `);

    if (schemaResult.rows.length === 0) {
      throw new Error("Payload schema does not exist");
    }

    // Check if critical tables exist
    const requiredTables = [
      "imports",
      "events",
      "catalogs",
      "datasets",
      "users",
      "media",
      "location_cache",
      "geocoding_providers",
      "payload_migrations",
      "payload_jobs",
      "payload_jobs_log",
    ];

    for (const tableName of requiredTables) {
      const tableResult = await client.query(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'payload'
        AND table_name = $1
      `,
        [tableName],
      );

      if (tableResult.rows.length === 0) {
        // Debug: check what tables exist in payload schema
        await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'payload'
          ORDER BY table_name
        `);
        throw new Error(`Required table 'payload.${tableName}' does not exist`);
      }
    }
  } finally {
    await client.end();
  }
};
