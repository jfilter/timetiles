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
  // Shared by the scraper-trigger identities below.
  scraperTrigger: "scraperTrigger123",
} as const;

/**
 * Admin identities reserved for the scraper manual-trigger E2E tests.
 *
 * The trigger endpoint throttles to one run per 30 seconds per user id, and
 * Playwright restarts a serial block from the top on retry. Sharing one login
 * across attempts made a retry inherit the previous attempt's burst budget and
 * see 429 instead of the status under test. One identity per attempt removes
 * that coupling; the count matches `retries: 2` in playwright.config.ts, so
 * raising retries means adding entries here.
 */
export const SCRAPER_TRIGGER_USER_EMAILS = [
  "scraper-trigger-0@example.com",
  "scraper-trigger-1@example.com",
  "scraper-trigger-2@example.com",
] as const;

export const SEED_USER_API_KEYS = { admin: "dev-admin-api-key-timetiles" } as const;
