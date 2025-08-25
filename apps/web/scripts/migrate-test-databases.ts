#!/usr/bin/env tsx
/**
 * Applies migrations to all test databases.
 * 
 * This script ensures all worker-specific test databases have the latest
 * migrations applied. Useful when adding new migrations that need to be
 * applied to existing test databases.
 * 
 * Usage: pnpm tsx scripts/migrate-test-databases.ts
 */

import { execSync } from "child_process";
import { Client } from "pg";

async function main() {
  const client = new Client({
    host: "localhost",
    user: "timetiles_user",
    password: "timetiles_password",
    database: "postgres",
  });

  try {
    await client.connect();
    
    // Get all test databases
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'timetiles_test%' ORDER BY datname"
    );
    
    const databases = result.rows.map(row => row.datname);
    console.log(`Found ${databases.length} test databases`);
    
    for (const dbName of databases) {
      console.log(`\nMigrating ${dbName}...`);
      const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;
      
      try {
        execSync(`DATABASE_URL="${dbUrl}" pnpm payload migrate`, {
          stdio: "inherit",
          cwd: process.cwd(),
        });
      } catch (error) {
        console.error(`Failed to migrate ${dbName}:`, error);
      }
    }
    
    console.log("\nAll test databases migrated!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();