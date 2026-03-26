import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "group" varchar;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_group" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "group";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_group";`)
}
