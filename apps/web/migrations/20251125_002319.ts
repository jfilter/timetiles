import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_registration_source" AS ENUM('admin', 'self');
  CREATE TYPE "payload"."enum__users_v_version_registration_source" AS ENUM('admin', 'self');
  ALTER TABLE "payload"."users" ADD COLUMN "registration_source" "payload"."enum_users_registration_source" DEFAULT 'admin';
  ALTER TABLE "payload"."users" ADD COLUMN "_verified" boolean;
  ALTER TABLE "payload"."users" ADD COLUMN "_verificationtoken" varchar;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_registration_source" "payload"."enum__users_v_version_registration_source" DEFAULT 'admin';
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version__verified" boolean;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version__verificationtoken" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" DROP COLUMN "registration_source";
  ALTER TABLE "payload"."users" DROP COLUMN "_verified";
  ALTER TABLE "payload"."users" DROP COLUMN "_verificationtoken";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_registration_source";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version__verified";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version__verificationtoken";
  DROP TYPE "payload"."enum_users_registration_source";
  DROP TYPE "payload"."enum__users_v_version_registration_source";`)
}
