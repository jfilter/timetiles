import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."scraper_repos_deleted_at_idx";
  DROP INDEX "payload"."scrapers_deleted_at_idx";
  ALTER TABLE "payload"."scraper_repos" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "deleted_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scraper_repos" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  CREATE INDEX "scraper_repos_deleted_at_idx" ON "payload"."scraper_repos" USING btree ("deleted_at");
  CREATE INDEX "scrapers_deleted_at_idx" ON "payload"."scrapers" USING btree ("deleted_at");`)
}
