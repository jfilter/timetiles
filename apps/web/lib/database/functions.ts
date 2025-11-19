/**
 * Provides utilities for checking and managing PostgreSQL database functions.
 *
 * This module centralizes common database function checks used across API routes,
 * ensuring consistent error handling and logging when verifying the existence
 * of custom PostgreSQL functions.
 *
 * @module
 * @category Utils
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { logger } from "@/lib/logger";

/**
 * Check if a PostgreSQL function exists in the database.
 *
 * This is useful for verifying that custom database functions (like histogram
 * calculations or clustering) are properly installed before attempting to use them.
 *
 * @param payload - Payload instance with database connection
 * @param functionName - Name of the PostgreSQL function to check
 * @returns True if function exists, false otherwise
 *
 * @example
 * ```typescript
 * const exists = await checkDatabaseFunction(payload, 'calculate_event_histogram');
 * if (!exists) {
 *   return NextResponse.json({ error: 'Database function not found' }, { status: 500 });
 * }
 * ```
 */
export const checkDatabaseFunction = async (payload: Payload, functionName: string): Promise<boolean> => {
  try {
    const functionCheck = (await payload.db.drizzle.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = ${functionName}
      ) as exists
    `)) as { rows: Array<{ exists: boolean }> };

    const exists = functionCheck.rows[0]?.exists ?? false;
    logger.debug(`Database function check for '${functionName}':`, { exists });
    return exists;
  } catch (error) {
    logger.warn(`Function check failed for '${functionName}':`, { error });
    return false;
  }
};
