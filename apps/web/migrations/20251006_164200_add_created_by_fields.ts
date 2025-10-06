import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."catalogs" ADD COLUMN IF NOT EXISTS "created_by_id" integer;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN IF NOT EXISTS "version_created_by_id" integer;
  ALTER TABLE "payload"."media" ADD COLUMN IF NOT EXISTS "created_by_id" integer;
  ALTER TABLE "payload"."_media_v" ADD COLUMN IF NOT EXISTS "version_created_by_id" integer;

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogs_created_by_id_users_id_fk') THEN
      ALTER TABLE "payload"."catalogs" ADD CONSTRAINT "catalogs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_catalogs_v_version_created_by_id_users_id_fk') THEN
      ALTER TABLE "payload"."_catalogs_v" ADD CONSTRAINT "_catalogs_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_created_by_id_users_id_fk') THEN
      ALTER TABLE "payload"."media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_media_v_version_created_by_id_users_id_fk') THEN
      ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS "catalogs_created_by_idx" ON "payload"."catalogs" USING btree ("created_by_id");
  CREATE INDEX IF NOT EXISTS "_catalogs_v_version_version_created_by_idx" ON "payload"."_catalogs_v" USING btree ("version_created_by_id");
  CREATE INDEX IF NOT EXISTS "media_created_by_idx" ON "payload"."media" USING btree ("created_by_id");
  CREATE INDEX IF NOT EXISTS "_media_v_version_version_created_by_idx" ON "payload"."_media_v" USING btree ("version_created_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload"."catalogs_created_by_idx";
  DROP INDEX IF EXISTS "payload"."_catalogs_v_version_version_created_by_idx";
  DROP INDEX IF EXISTS "payload"."media_created_by_idx";
  DROP INDEX IF EXISTS "payload"."_media_v_version_version_created_by_idx";

  ALTER TABLE "payload"."catalogs" DROP CONSTRAINT IF EXISTS "catalogs_created_by_id_users_id_fk";
  ALTER TABLE "payload"."_catalogs_v" DROP CONSTRAINT IF EXISTS "_catalogs_v_version_created_by_id_users_id_fk";
  ALTER TABLE "payload"."media" DROP CONSTRAINT IF EXISTS "media_created_by_id_users_id_fk";
  ALTER TABLE "payload"."_media_v" DROP CONSTRAINT IF EXISTS "_media_v_version_created_by_id_users_id_fk";

  ALTER TABLE "payload"."catalogs" DROP COLUMN IF EXISTS "created_by_id";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN IF EXISTS "version_created_by_id";
  ALTER TABLE "payload"."media" DROP COLUMN IF EXISTS "created_by_id";
  ALTER TABLE "payload"."_media_v" DROP COLUMN IF EXISTS "version_created_by_id";`)
}
