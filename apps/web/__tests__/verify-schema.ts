import { Client } from "pg";

/**
 * Verifies that the database schema has been properly set up with all required tables
 */
export async function verifyDatabaseSchema(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
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
      'imports',
      'events', 
      'catalogs',
      'datasets',
      'users',
      'media',
      'location_cache',
      'geocoding_providers',
      'payload_migrations',
      'payload_jobs',
      'payload_jobs_log'
    ];
    
    for (const tableName of requiredTables) {
      const tableResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'payload' 
        AND table_name = $1
      `, [tableName]);
      
      if (tableResult.rows.length === 0) {
        throw new Error(`Required table 'payload.${tableName}' does not exist`);
      }
    }
    
    console.log(`[VERIFY] Database schema verified successfully - all ${requiredTables.length} required tables exist`);
    
  } catch (error) {
    console.error("[VERIFY] Database schema verification failed:", error);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Waits for migrations to be marked as complete in the database
 */
export async function waitForMigrations(connectionString: string, timeout = 30000): Promise<void> {
  const client = new Client({ connectionString });
  const startTime = Date.now();
  
  try {
    await client.connect();
    
    while (Date.now() - startTime < timeout) {
      try {
        // First check if the migrations table exists
        const tableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'payload' 
            AND table_name = 'payload_migrations'
          )
        `);
        
        if (!tableCheck.rows[0].exists) {
          console.log(`[VERIFY] Migrations table doesn't exist yet, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        
        // Check if migrations table has entries
        const result = await client.query(`
          SELECT COUNT(*) as count 
          FROM payload.payload_migrations
        `);
        
        const migrationCount = parseInt(result.rows[0].count);
        console.log(`[VERIFY] Current migration count: ${migrationCount}`);
        
        // In test mode, we expect at least the initial migration
        if (migrationCount > 0) {
          console.log(`[VERIFY] Found ${migrationCount} completed migrations`);
          return;
        }
      } catch (error) {
        // Log the actual error
        console.log(`[VERIFY] Error checking migrations:`, error);
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Timed out waiting for migrations after ${timeout}ms`);
    
  } finally {
    await client.end();
  }
}