/**
 * Hash existing webhook tokens in-place.
 *
 * Previously `scheduled_ingests.webhook_token` and `scrapers.webhook_token`
 * stored the plaintext 64-hex-char token. Combined with a non-constant-time
 * SQL equality compare that exposed every active webhook credential on a DB
 * leak (and a theoretical timing-leak surface). This migration hashes every
 * non-null token in-place so only SHA-256 hashes remain at rest.
 *
 * Existing webhook clients continue to work: they POST the plaintext URL,
 * `resolveWebhookToken` hashes the incoming value before querying, so the
 * match succeeds against the now-hashed column.
 *
 * This is a one-way migration — the plaintext cannot be recovered after
 * hashing. The `down` migration is a no-op for that reason; downgrading
 * would orphan all active webhook tokens and require users to rotate.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // `pgcrypto` provides `digest(bytea, text)`. Most managed Postgres images
  // (including the project's docker setup) ship it, but ensure it's active
  // in this database first.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Hash only rows that currently hold a 64-hex-char plaintext. After this
  // migration runs, any row whose value is already 64-hex could either be a
  // hash we produced here or a newly generated hash from the application —
  // both are acceptable. The length check (we avoid mutating values already
  // longer/shorter than 64) keeps us idempotent if someone re-runs the
  // migration by mistake.
  await db.execute(sql`
    UPDATE payload.scheduled_ingests
       SET webhook_token = encode(digest(webhook_token, 'sha256'), 'hex')
     WHERE webhook_token IS NOT NULL
       AND length(webhook_token) = 64
       AND webhook_token ~ '^[0-9a-f]{64}$';
  `);

  await db.execute(sql`
    UPDATE payload.scrapers
       SET webhook_token = encode(digest(webhook_token, 'sha256'), 'hex')
     WHERE webhook_token IS NOT NULL
       AND length(webhook_token) = 64
       AND webhook_token ~ '^[0-9a-f]{64}$';
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Hashing is one-way. Downgrading would leave every active webhook token
  // broken with no recovery path, so down is a deliberate no-op — operators
  // rotating back to the plaintext schema must instruct users to rotate
  // their webhook tokens out-of-band.
}
