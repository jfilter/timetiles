import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

/**
 * Backfill for credential revocation on deactivated accounts.
 *
 * `isActive: false` used to be enforced only in the `beforeLogin` hook, so accounts that
 * were deactivated — or fully deleted, which also sets `isActive: false` — kept working
 * credentials. The `revokeCredentialsOnDeactivation` hook only fires on a live
 * `true -> false` transition, so it does nothing for accounts already in that state. This
 * clears them once.
 *
 * Data-only: no schema change, so it carries no snapshot and does not affect the next
 * `migrate:create`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Payload's API-key strategy consults neither isActive nor sessions nor beforeLogin, so a
  // key issued to one of these accounts still authenticates as them under their old role.
  await db.execute(sql`
    UPDATE "payload"."users"
    SET "enable_a_p_i_key" = false, "api_key" = NULL, "api_key_index" = NULL
    WHERE "is_active" = false
      AND ("enable_a_p_i_key" = true OR "api_key" IS NOT NULL OR "api_key_index" IS NOT NULL);`);

  // Any surviving session keeps its JWT valid and lets /api/users/refresh-token renew it.
  await db.execute(sql`
    DELETE FROM "payload"."users_sessions" s
    USING "payload"."users" u
    WHERE s."_parent_id" = u."id" AND u."is_active" = false;`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Irreversible by design: the cleared keys and deleted sessions are exactly the
  // credentials this migration exists to destroy. Restoring them would reopen the hole.
}
