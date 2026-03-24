// @vitest-environment node
/**
 * Integration tests for denyPendingDeletion access control wrapper.
 *
 * Verifies that users with `deletionStatus: "pending_deletion"` are denied
 * create operations on collections that use this guard (e.g., catalogs).
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import type { TestEnvironment } from "@/tests/setup/integration/environment";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("denyPendingDeletion Access Control", () => {
  let testEnv: TestEnvironment;
  let normalUser: User;
  let pendingDeletionUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();

    const { users } = await withUsers(testEnv, { normalUser: { role: "user" }, pendingDeletionUser: { role: "user" } });
    normalUser = users.normalUser;
    pendingDeletionUser = users.pendingDeletionUser;

    // Set deletion status directly via overrideAccess to simulate account deletion scheduling
    await testEnv.payload.update({
      collection: "users",
      id: pendingDeletionUser.id,
      data: { deletionStatus: "pending_deletion" } as Record<string, unknown>,
      overrideAccess: true,
    });

    // Refresh user object to include the updated deletionStatus — eslint-disable-next-line require-atomic-updates
    // eslint-disable-next-line require-atomic-updates -- sequential test setup, no race
    pendingDeletionUser = await testEnv.payload.findByID({
      collection: "users",
      id: pendingDeletionUser.id,
      overrideAccess: true,
    });
  }, 60_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clean up catalogs between tests to avoid slug collisions
    await testEnv.seedManager.truncate(["catalogs"]);
  });

  it("should deny catalog creation for a user with pending_deletion status", async () => {
    await expect(
      testEnv.payload.create({
        collection: "catalogs",
        data: { name: "Should Not Be Created", isPublic: true },
        user: pendingDeletionUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should allow catalog creation for a normal user without pending deletion", async () => {
    const catalog = await testEnv.payload.create({
      collection: "catalogs",
      data: { name: "Normal User Catalog", isPublic: true },
      user: normalUser,
      overrideAccess: false,
    });

    expect(catalog.id).toBeDefined();
    expect(catalog.name).toBe("Normal User Catalog");
  });

  it("should still allow read operations for a pending-deletion user", async () => {
    // Create a public catalog via admin/override
    const catalog = await testEnv.payload.create({
      collection: "catalogs",
      data: { name: "Public Catalog For Read Test", isPublic: true },
      overrideAccess: true,
    });

    // Pending-deletion user should still be able to read public catalogs
    const result = await testEnv.payload.find({
      collection: "catalogs",
      where: { id: { equals: catalog.id } },
      user: pendingDeletionUser,
      overrideAccess: false,
    });

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]?.name).toBe("Public Catalog For Read Test");
  });
});
