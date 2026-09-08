/**
 * Native Payload validation of administrator-supplied quota overrides.
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("User custom quota validation", () => {
  let testEnv: TestEnvironment;
  let owner: User;
  let admin: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    const { users } = await withUsers(testEnv, { owner: { role: "user" }, admin: { role: "admin" } });
    owner = users.owner;
    admin = users.admin;
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it.each([
    { maxTotalEvents: -2 },
    { maxTotalEvents: 1.5 },
    { maxFileSizeMB: 0 },
    { maxFileSizeMB: -1 },
    { maxFileSizeMB: "10" },
    { maxTotalEvent: 10 },
  ])("rejects invalid overrides %j", async (customQuotas) => {
    await expect(
      testEnv.payload.update({
        collection: "users",
        id: owner.id,
        data: { customQuotas: customQuotas as User["customQuotas"] },
        overrideAccess: false,
        user: admin,
      })
    ).rejects.toThrow(/customQuotas|custom quotas/i);
  });

  it("accepts partial overrides and clearing them", async () => {
    const customQuotas = { maxTotalEvents: -1, maxFileUploadsPerDay: 0, maxFileSizeMB: 1 };
    const updated = await testEnv.payload.update({
      collection: "users",
      id: owner.id,
      data: { customQuotas },
      overrideAccess: false,
      user: admin,
    });
    expect(updated.customQuotas).toEqual(customQuotas);

    const cleared = await testEnv.payload.update({
      collection: "users",
      id: owner.id,
      data: { customQuotas: null },
      overrideAccess: false,
      user: admin,
    });
    expect(cleared.customQuotas).toBeNull();
  });
});
