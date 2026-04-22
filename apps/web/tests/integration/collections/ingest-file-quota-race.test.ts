// @vitest-environment node
/**
 * Integration test for the FILE_UPLOADS_PER_DAY TOCTOU race.
 *
 * H2: the legacy `ingest-files` hook pair split the quota check
 * (`beforeValidate`) from the increment (`afterChange`), letting two
 * concurrent uploads both pass the pre-check and both succeed. The fix
 * consolidates to a single atomic `checkAndIncrementUsage` in
 * `beforeValidate`, backed by Drizzle's `UPDATE ... WHERE current + n <= limit`.
 *
 * This test exercises the atomic primitive directly with concurrent callers.
 * We don't go through `payload.create` for the race check because Payload's
 * Local API serializes writes on the same collection, which would hide the
 * race our fix actually guards against (the SQL-level TOCTOU on
 * `user_usage`).
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { QuotaExceededError } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("FILE_UPLOADS_PER_DAY atomic quota", () => {
  const collectionsToReset = ["user-usage"];

  let testEnv: TestEnvironment;
  let quotaUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });

    // Small quota (2) so concurrent > quota exercises both the success and
    // the rejection branches of the atomic UPDATE.
    const { users } = await withUsers(testEnv, {
      quotaUser: { role: "user", trustLevel: "1", customQuotas: { maxFileUploadsPerDay: 2 } },
    });
    quotaUser = users.quotaUser;
  }, 60000);

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  it("atomic UPDATE allows exactly `limit` concurrent claims — the TOCTOU race cannot over-grant", async () => {
    // Import inside the test so vitest's per-test environment reset works.
    const { createQuotaService } = await import("@/lib/services/quota-service");
    const quotaService = createQuotaService(testEnv.payload);

    const concurrentAttempts = 5;
    const quotaLimit = 2;

    const results = await Promise.allSettled(
      Array.from({ length: concurrentAttempts }, () =>
        quotaService.checkAndIncrementUsage(quotaUser, "FILE_UPLOADS_PER_DAY", 1)
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(quotaLimit);
    expect(rejected).toHaveLength(concurrentAttempts - quotaLimit);
    // Every rejection must be a QuotaExceededError, not an unrelated DB error.
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(QuotaExceededError);
    }

    // The DB row reflects exactly `limit` increments — the atomic UPDATE
    // did not let a sixth (or even a third) increment slip through.
    const usage = await testEnv.payload.find({
      collection: "user-usage",
      where: { user: { equals: quotaUser.id } },
      limit: 1,
      overrideAccess: true,
    });
    expect(usage.docs[0]?.fileUploadsToday).toBe(quotaLimit);
  }, 30000);

  it("getOrCreateUsageRecord is race-safe when two callers hit an empty user-usage row", async () => {
    const { createQuotaService } = await import("@/lib/services/quota-service");
    const quotaService = createQuotaService(testEnv.payload);

    // No row exists yet (truncated in beforeEach). Two concurrent callers
    // both see the gap and both INSERT — the ON CONFLICT upsert must make
    // one of them a no-op without throwing a unique-constraint error.
    const results = await Promise.all([
      quotaService.getOrCreateUsageRecord(quotaUser.id),
      quotaService.getOrCreateUsageRecord(quotaUser.id),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe(results[1]?.id);
  }, 30000);

  it("decrementUsage compensates a prior claim without leaving the row negative", async () => {
    const { createQuotaService } = await import("@/lib/services/quota-service");
    const quotaService = createQuotaService(testEnv.payload);

    // Claim once, then compensate.
    await quotaService.checkAndIncrementUsage(quotaUser, "FILE_UPLOADS_PER_DAY", 1);
    await quotaService.decrementUsage(quotaUser.id, "FILE_UPLOADS_PER_DAY", 1);

    const usage = await testEnv.payload.find({
      collection: "user-usage",
      where: { user: { equals: quotaUser.id } },
      limit: 1,
      overrideAccess: true,
    });
    expect(usage.docs[0]?.fileUploadsToday).toBe(0);

    // Decrementing again must not drive it below zero (GREATEST(0, ...)).
    await quotaService.decrementUsage(quotaUser.id, "FILE_UPLOADS_PER_DAY", 1);
    const after = await testEnv.payload.find({
      collection: "user-usage",
      where: { user: { equals: quotaUser.id } },
      limit: 1,
      overrideAccess: true,
    });
    expect(after.docs[0]?.fileUploadsToday).toBe(0);
  }, 30000);
});
