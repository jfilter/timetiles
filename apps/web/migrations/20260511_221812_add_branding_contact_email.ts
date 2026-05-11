/**
 * Add `contact_email` column to the Branding global.
 *
 * Backs the new public contact-email field surfaced on the
 * disabled-registration screen so visitors know how to request an account.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."branding" ADD COLUMN IF NOT EXISTS "contact_email" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."branding" DROP COLUMN IF EXISTS "contact_email";
  `);
}
