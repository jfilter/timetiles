import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_scheduled_ingests_execution_history_status" ADD VALUE 'paused';
  ALTER TYPE "payload"."enum_scheduled_ingests_last_status" ADD VALUE 'paused';
  ALTER TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status" ADD VALUE 'paused';
  ALTER TYPE "payload"."enum__scheduled_ingests_v_version_last_status" ADD VALUE 'paused';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests_execution_history" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_ingests_execution_history_status";
  CREATE TYPE "payload"."enum_scheduled_ingests_execution_history_status" AS ENUM('success', 'failed');
  ALTER TABLE "payload"."scheduled_ingests_execution_history" ALTER COLUMN "status" SET DATA TYPE "payload"."enum_scheduled_ingests_execution_history_status" USING "status"::"payload"."enum_scheduled_ingests_execution_history_status";
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_ingests_last_status";
  CREATE TYPE "payload"."enum_scheduled_ingests_last_status" AS ENUM('success', 'failed', 'running');
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "last_status" SET DATA TYPE "payload"."enum_scheduled_ingests_last_status" USING "last_status"::"payload"."enum_scheduled_ingests_last_status";
  ALTER TABLE "payload"."_scheduled_ingests_v_version_execution_history" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status";
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status" AS ENUM('success', 'failed');
  ALTER TABLE "payload"."_scheduled_ingests_v_version_execution_history" ALTER COLUMN "status" SET DATA TYPE "payload"."enum__scheduled_ingests_v_version_execution_history_status" USING "status"::"payload"."enum__scheduled_ingests_v_version_execution_history_status";
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_ingests_v_version_last_status";
  CREATE TYPE "payload"."enum__scheduled_ingests_v_version_last_status" AS ENUM('success', 'failed', 'running');
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_last_status" SET DATA TYPE "payload"."enum__scheduled_ingests_v_version_last_status" USING "version_last_status"::"payload"."enum__scheduled_ingests_v_version_last_status";`)
}
