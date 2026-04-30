/**
 * Add maintenance job task slugs to the Payload job enums.
 *
 * The task handlers were registered in code, but fresh databases created
 * from migrations did not have matching enum values. Payload's scheduler
 * probes scheduled jobs by task slug, so the missing enum values made E2E
 * databases log repeated `invalid input value for enum` errors.
 *
 * @module
 * @category Migrations
 */

import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'rate-limit-cleanup' BEFORE 'cache-cleanup';
    ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'preview-cleanup' BEFORE 'schema-maintenance';
    ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'rate-limit-cleanup' BEFORE 'cache-cleanup';
    ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'preview-cleanup' BEFORE 'schema-maintenance';
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL enum values cannot be dropped safely without rebuilding the
  // type and rewriting dependent columns. Keep the rollback a no-op, matching
  // the forward-only nature of additive enum migrations in production.
}
