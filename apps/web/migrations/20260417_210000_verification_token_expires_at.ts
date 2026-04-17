/**
 * Add the `_verificationtokenexpiresat` column to the users table.
 *
 * Backs the TTL check in `/api/users/verify/[token]`: verification tokens now
 * expire after 24 hours (stamped by the Users collection's `beforeChange`
 * hook whenever `_verificationToken` is set). Older rows — those verified or
 * with outstanding tokens issued before this rollout — will have NULL here,
 * which the verify route treats as expired (forces a fresh token).
 *
 * Payload's Drizzle schema maps the camelCase field `_verificationTokenExpiresAt`
 * to the lower-case column `_verificationtokenexpiresat` (no underscores between
 * the words — Payload's convention for fields that begin with an underscore).
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE payload.users
      ADD COLUMN IF NOT EXISTS "_verificationtokenexpiresat" timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE payload.users
      DROP COLUMN IF EXISTS "_verificationtokenexpiresat";
  `);
}
