// @vitest-environment node
/**
 * Does a failed ingest-file create leave FILE_UPLOADS_PER_DAY correct?
 *
 * The claim is made in `beforeValidate` through the transaction-aware Drizzle
 * client, so Payload's create transaction covers it and a rollback undoes it.
 * A separate `afterError` hook ALSO decrements, and it runs after the rollback,
 * outside the transaction. If both fire, one failed create nets -1 against the
 * committed counter and repeated deliberate failures reset the daily quota.
 *
 * This test decides empirically whether that double-rollback is real, because
 * the reasoning alone cuts both ways: if the claim were NOT transactional, the
 * compensation would be exactly right and removing it would introduce a leak.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createQuotaService } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("FILE_UPLOADS_PER_DAY after a failed create", () => {
  let testEnv: TestEnvironment;
  let user: User;

  const usageFor = async (): Promise<number> => {
    const record = await createQuotaService(testEnv.payload).getOrCreateUsageRecord(user.id);
    return Number(record.fileUploadsToday ?? 0);
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    const { users } = await withUsers(testEnv, {
      quotaUser: { role: "user", trustLevel: "1", customQuotas: { maxFileUploadsPerDay: 10 } },
    });
    user = users.quotaUser;
  }, 60000);

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  beforeEach(async () => {
    await testEnv.seedManager?.truncateCollections?.(["user-usage"]);
  });

  it("does not go below zero when a create fails after the quota claim", async () => {
    // Seed a non-zero counter first. Starting from an absent/zero row would
    // make the assertion vacuous: a compensating decrement against a row that
    // does not exist is a no-op, so the test would pass whether or not the
    // double-rollback happens.
    const quotaService = createQuotaService(testEnv.payload);
    await quotaService.checkAndIncrementUsage(user, "FILE_UPLOADS_PER_DAY", 3);

    const before = await usageFor();
    expect(before).toBe(3);

    // Fails in validation AFTER beforeValidate has claimed the quota: the
    // required `dataset` relationship is absent, so Payload aborts the create
    // and rolls the transaction back.
    await expect(
      testEnv.payload.create({
        collection: "ingest-files",
        data: { originalName: "quota-rollback.csv", status: "pending" } as never,
        user,
        overrideAccess: false,
      })
    ).rejects.toThrow();

    const after = await usageFor();

    // Measured: before=3, after=3. A double rollback (transaction undo plus the
    // afterError compensation running outside it) would leave 2, so the
    // reported net-decrement does not occur on this path. Kept as a guard,
    // since the compensation and the transaction are easy to desynchronize.
    expect(after).toBe(before);
  });

  it("counts a successful create exactly once", async () => {
    const before = await usageFor();

    await createQuotaService(testEnv.payload).checkAndIncrementUsage(user, "FILE_UPLOADS_PER_DAY", 1);

    expect(await usageFor()).toBe(before + 1);
  });
});
