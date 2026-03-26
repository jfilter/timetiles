import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "enum_detection_mode";
  ALTER TABLE "payload"."datasets" DROP COLUMN "enum_detection_threshold";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_enum_detection_mode";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_enum_detection_threshold";
  DROP TYPE "payload"."enum_datasets_enum_detection_mode";
  DROP TYPE "payload"."enum__datasets_v_version_enum_detection_mode";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  CREATE TYPE "payload"."enum__datasets_v_version_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  ALTER TABLE "payload"."datasets" ADD COLUMN "enum_detection_mode" "payload"."enum_datasets_enum_detection_mode" DEFAULT 'count';
  ALTER TABLE "payload"."datasets" ADD COLUMN "enum_detection_threshold" numeric DEFAULT 50;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_enum_detection_mode" "payload"."enum__datasets_v_version_enum_detection_mode" DEFAULT 'count';
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_enum_detection_threshold" numeric DEFAULT 50;`)
}
