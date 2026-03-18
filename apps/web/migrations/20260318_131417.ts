import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_locale" AS ENUM('en', 'de');
  ALTER TABLE "payload"."users" ADD COLUMN "locale" "payload"."enum_users_locale" DEFAULT 'en';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" DROP COLUMN "locale";
  DROP TYPE "payload"."enum_users_locale";`)
}
