#!/usr/bin/env tsx
/**
 * Cleans up old test databases.
 * 
 * This script removes test databases that are no longer in use.
 * It keeps the main test database and worker databases 1-10.
 * 
 * Usage: pnpm tsx scripts/cleanup-test-databases.ts
 */

import { Client } from "pg";

async function main() {
  const client = new Client({
    host: "localhost",
    user: "timetiles_user",
    password: "timetiles_password",
    database: "postgres",
  });

  const keepDatabases = new Set([
    "timetiles_test",
    // Keep worker databases 1-10
    ...Array.from({ length: 10 }, (_, i) => `timetiles_test_${i + 1}`),
  ]);

  try {
    await client.connect();
    
    // Get all test databases
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'timetiles_test%' ORDER BY datname"
    );
    
    const databases = result.rows.map(row => row.datname);
    console.log(`Found ${databases.length} test databases`);
    
    const toDelete = databases.filter(db => !keepDatabases.has(db));
    
    if (toDelete.length === 0) {
      console.log("No databases to clean up");
      return;
    }
    
    console.log(`\nWill delete ${toDelete.length} old test databases:`);
    toDelete.forEach(db => console.log(`  - ${db}`));
    
    console.log("\nDeleting databases...");
    for (const dbName of toDelete) {
      try {
        // Terminate any connections to the database
        await client.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [dbName]);
        
        // Drop the database
        await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        console.log(`  ✓ Deleted ${dbName}`);
      } catch (error) {
        console.error(`  ✗ Failed to delete ${dbName}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    console.log("\nCleanup complete!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();