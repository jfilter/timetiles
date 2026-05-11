/**
 * No-op migration that resets the Drizzle snapshot baseline.
 *
 * Three previous migrations were hand-written without snapshots
 * (`20260417_210000_verification_token_expires_at`,
 * `20260421_100000_hash_webhook_tokens`,
 * `20260430_145549_add_maintenance_job_task_slugs`). Without paired `.json`
 * files, `payload migrate:create` kept rediscovering the same schema deltas
 * each time it was run. This migration carries a fresh snapshot reflecting
 * the current Payload config so future `migrate:create` invocations start
 * from a clean baseline. Up/down are intentionally empty — applying it just
 * records a `payload_migrations` row.
 *
 * @module
 * @category Migrations
 */
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up(_args: MigrateUpArgs): Promise<void> {
  // Snapshot-only checkpoint. See module docstring.
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op.
}
