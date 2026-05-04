/**
 * Default credentials for seeded users.
 *
 * Lives in the seed module (not under `tests/`) so it ships in the
 * production build — the seed manager runs `onInit` for the deploy
 * preset and the production Docker context excludes `apps/web/tests/`.
 *
 * These are non-secret development defaults: real production users are
 * created through the dashboard or registration flow, not seeded.
 *
 * @module
 */
export const SEED_USER_PASSWORDS = {
  admin: "admin123",
  editor: "editor123",
  demo: "demo",
  // Strong-looking password reused for additional dev-only seeded users.
  strong: "strongPassword123",
} as const;

export const SEED_USER_API_KEYS = { admin: "dev-admin-api-key-timetiles" } as const;
