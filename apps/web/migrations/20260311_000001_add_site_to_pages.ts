import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add site_id column to pages
  await db.execute(sql`
    ALTER TABLE "payload"."pages" ADD COLUMN "site_id" integer;
    ALTER TABLE "payload"."pages" ADD COLUMN "created_by_id" integer;
  `)

  // Add site_id column to _pages_v (versioned table)
  await db.execute(sql`
    ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_site_id" integer;
    ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_created_by_id" integer;
  `)

  // Assign existing pages to default site (if one exists)
  await db.execute(sql`
    UPDATE "payload"."pages"
    SET "site_id" = (
      SELECT "id" FROM "payload"."sites" WHERE "is_default" = true LIMIT 1
    )
    WHERE "site_id" IS NULL;
  `)

  // Create indexes
  await db.execute(sql`
    CREATE INDEX "pages_site_idx" ON "payload"."pages" USING btree ("site_id");
    CREATE INDEX "pages_created_by_idx" ON "payload"."pages" USING btree ("created_by_id");
    CREATE INDEX "_pages_v_version_version_site_idx" ON "payload"."_pages_v" USING btree ("version_site_id");
    CREATE INDEX "_pages_v_version_version_created_by_idx" ON "payload"."_pages_v" USING btree ("version_created_by_id");
  `)

  // Create FK constraints
  await db.execute(sql`
    ALTER TABLE "payload"."pages"
      ADD CONSTRAINT "pages_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    ALTER TABLE "payload"."pages"
      ADD CONSTRAINT "pages_created_by_id_users_id_fk"
      FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  `)

  await db.execute(sql`
    ALTER TABLE "payload"."_pages_v"
      ADD CONSTRAINT "_pages_v_version_site_id_sites_id_fk"
      FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    ALTER TABLE "payload"."_pages_v"
      ADD CONSTRAINT "_pages_v_version_created_by_id_users_id_fk"
      FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop FK constraints
  await db.execute(sql`
    ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT IF EXISTS "_pages_v_version_created_by_id_users_id_fk";
    ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT IF EXISTS "_pages_v_version_site_id_sites_id_fk";
    ALTER TABLE "payload"."pages" DROP CONSTRAINT IF EXISTS "pages_created_by_id_users_id_fk";
    ALTER TABLE "payload"."pages" DROP CONSTRAINT IF EXISTS "pages_site_id_sites_id_fk";
  `)

  // Drop indexes
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."_pages_v_version_version_created_by_idx";
    DROP INDEX IF EXISTS "payload"."_pages_v_version_version_site_idx";
    DROP INDEX IF EXISTS "payload"."pages_created_by_idx";
    DROP INDEX IF EXISTS "payload"."pages_site_idx";
  `)

  // Drop columns
  await db.execute(sql`
    ALTER TABLE "payload"."_pages_v" DROP COLUMN IF EXISTS "version_created_by_id";
    ALTER TABLE "payload"."_pages_v" DROP COLUMN IF EXISTS "version_site_id";
    ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "created_by_id";
    ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "site_id";
  `)
}
