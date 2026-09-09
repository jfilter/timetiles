import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "retry_config_retry_delay_minutes";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "retry_config_exponential_backoff";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_retry_config_retry_delay_minutes";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_retry_config_exponential_backoff";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "retry_config_retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "retry_config_exponential_backoff" boolean DEFAULT true;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_retry_config_retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_retry_config_exponential_backoff" boolean DEFAULT true;`)
}
