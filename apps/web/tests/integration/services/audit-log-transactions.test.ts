/**
 * Verify that field audits stop writing when the caller transaction fails.
 *
 * @module
 * @category Tests
 */
import { createLocalReq, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, auditFieldChanges } from "@/lib/services/audit-log-service";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Audit log transaction failures", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("does not start another field audit after a transactional write fails", async () => {
    const { payload } = testEnv;
    const { users } = await withUsers(testEnv, ["admin"]);
    const req = await createLocalReq({ user: users.admin }, payload);
    expect(await initTransaction(req)).toBe(true);
    const hooks = payload.collections["audit-log"].config.hooks;
    const originalHooks = hooks.beforeOperation;
    const failure = new Error("Audit operation failed");
    let attempts = 0;
    try {
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: `Uncommitted audit catalog ${crypto.randomUUID()}`, createdBy: users.admin.id },
        req,
        overrideAccess: true,
      });
      hooks.beforeOperation = [
        ...(originalHooks ?? []),
        () => {
          attempts++;
          throw failure;
        },
      ];
      await expect(
        auditFieldChanges(
          payload,
          {
            previousDoc: { role: "user", trustLevel: "1" },
            doc: { role: "admin", trustLevel: "3" },
            userId: users.admin.id,
            userEmail: users.admin.email,
          },
          [
            { action: AUDIT_ACTIONS.ROLE_CHANGED, fieldPath: "role" },
            { action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED, fieldPath: "trustLevel" },
          ],
          { req }
        )
      ).rejects.toBe(failure);
      expect(attempts).toBe(1);
      expect(req.transactionID).toBeUndefined();
      expect(
        await payload.findByID({ collection: "catalogs", id: catalog.id, disableErrors: true, overrideAccess: true })
      ).toBeNull();
    } finally {
      hooks.beforeOperation = originalHooks;
      await killTransaction(req);
    }
  });
});
