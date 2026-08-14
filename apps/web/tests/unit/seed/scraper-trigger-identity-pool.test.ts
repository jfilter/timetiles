/**
 * Unit tests for the scraper-trigger identity pool.
 *
 * The scraper E2E spec logs in as `SCRAPER_TRIGGER_USER_EMAILS[testInfo.retry]`
 * so a retried attempt gets its own identity instead of inheriting the
 * previous attempt's 30s trigger-throttle budget (see `ba556d77`). Every run
 * so far has passed on the first try, so `testInfo.retry` has only ever been
 * `0` — the part of the pool that matters for a retry has no coverage. These
 * tests check the invariants that keep the pool correct without needing a
 * real retried E2E run: enough identities for every attempt Playwright's
 * retry setting can produce, no attempt sharing another's identity, and the
 * e2e seed's user-count cap not silently truncating the pool away.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { getCollectionConfig } from "@/lib/seed/seed.config";
import { SCRAPER_TRIGGER_USER_EMAILS, SEED_USER_PASSWORDS } from "@/lib/seed/seeds/seed-credentials";
import { userSeeds } from "@/lib/seed/seeds/users";
import playwrightConfig from "@/playwright.config";

describe("scraper-trigger identity pool", () => {
  // testInfo.retry runs 0..retries inclusive, so `retries: 2` produces attempts 0, 1, 2.
  const maxRetries = playwrightConfig.retries ?? 0;
  const attemptIndexes = Array.from({ length: maxRetries + 1 }, (_, retry) => retry);

  it("has one pool entry for every attempt the configured retries can produce", () => {
    expect(SCRAPER_TRIGGER_USER_EMAILS.length).toBeGreaterThan(maxRetries);
  });

  it("selects a defined, distinct identity for every possible attempt", () => {
    const selected = attemptIndexes.map((retry) => SCRAPER_TRIGGER_USER_EMAILS[retry]);

    selected.forEach((email, retry) => {
      expect(email, `no seeded trigger identity for attempt ${retry}`).toBeDefined();
    });
    // Two attempts sharing an identity is exactly the bug the pool exists to prevent.
    expect(new Set(selected).size).toBe(selected.length);
  });

  it("is not truncated away by the e2e preset's user-count cap", () => {
    const e2eUsers = userSeeds("e2e");
    const usersConfig = getCollectionConfig("users", "e2e");
    expect(usersConfig, "no seed config for the users collection").not.toBeNull();
    const cap = typeof usersConfig?.count === "function" ? usersConfig.count("e2e") : (usersConfig?.count as number);

    // Seeding slices the array down to the cap when it is exceeded, and the
    // trigger identities are appended last — a lowered cap drops them first.
    expect(e2eUsers.length).toBeLessThanOrEqual(cap);

    SCRAPER_TRIGGER_USER_EMAILS.forEach((email) => {
      expect(e2eUsers.some((user) => user.email === email)).toBe(true);
    });
  });

  it("seeds every pool identity as an admin with the shared trigger password", () => {
    const e2eUsers = userSeeds("e2e");

    SCRAPER_TRIGGER_USER_EMAILS.forEach((email) => {
      const user = e2eUsers.find((candidate) => candidate.email === email);
      expect(user, `missing e2e seed for ${email}`).toBeDefined();
      expect(user?.role).toBe("admin");
      expect(user?.password).toBe(SEED_USER_PASSWORDS.scraperTrigger);
    });
  });
});
