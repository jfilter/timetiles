/* eslint-disable sonarjs/no-hardcoded-ip -- Test file uses IP addresses as test data */
// @vitest-environment node
/**
 * Unit tests for the audit log service.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AUDIT_ACTIONS, auditFieldChanges, auditLog } from "@/lib/services/audit-log-service";
import { hashEmail, hashIpAddress } from "@/lib/utils/hash";

describe.sequential("AUDIT_ACTIONS", () => {
  it("defines EMAIL_CHANGED action", () => {
    expect(AUDIT_ACTIONS.EMAIL_CHANGED).toBe("account.email_changed");
  });

  it("defines PASSWORD_CHANGED action", () => {
    expect(AUDIT_ACTIONS.PASSWORD_CHANGED).toBe("account.password_changed");
  });

  it("defines DELETION_SCHEDULED action", () => {
    expect(AUDIT_ACTIONS.DELETION_SCHEDULED).toBe("account.deletion_scheduled");
  });

  it("defines DELETION_CANCELLED action", () => {
    expect(AUDIT_ACTIONS.DELETION_CANCELLED).toBe("account.deletion_cancelled");
  });

  it("defines DELETION_EXECUTED action", () => {
    expect(AUDIT_ACTIONS.DELETION_EXECUTED).toBe("account.deletion_executed");
  });

  it("defines PASSWORD_VERIFY_FAILED action", () => {
    expect(AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED).toBe("account.password_verify_failed");
  });

  // Admin actions on users
  it("defines TRUST_LEVEL_CHANGED action", () => {
    expect(AUDIT_ACTIONS.TRUST_LEVEL_CHANGED).toBe("admin.trust_level_changed");
  });

  it("defines ROLE_CHANGED action", () => {
    expect(AUDIT_ACTIONS.ROLE_CHANGED).toBe("admin.role_changed");
  });

  it("defines USER_ACTIVATED action", () => {
    expect(AUDIT_ACTIONS.USER_ACTIVATED).toBe("admin.user_activated");
  });

  it("defines USER_DEACTIVATED action", () => {
    expect(AUDIT_ACTIONS.USER_DEACTIVATED).toBe("admin.user_deactivated");
  });

  it("defines CUSTOM_QUOTAS_CHANGED action", () => {
    expect(AUDIT_ACTIONS.CUSTOM_QUOTAS_CHANGED).toBe("admin.custom_quotas_changed");
  });

  it("defines QUOTA_OVERRIDDEN action", () => {
    expect(AUDIT_ACTIONS.QUOTA_OVERRIDDEN).toBe("admin.quota_overridden");
  });

  // Data visibility
  it("defines CATALOG_VISIBILITY_CHANGED action", () => {
    expect(AUDIT_ACTIONS.CATALOG_VISIBILITY_CHANGED).toBe("data.catalog_visibility_changed");
  });

  it("defines DATASET_VISIBILITY_CHANGED action", () => {
    expect(AUDIT_ACTIONS.DATASET_VISIBILITY_CHANGED).toBe("data.dataset_visibility_changed");
  });

  it("defines CATALOG_OWNERSHIP_TRANSFERRED action", () => {
    expect(AUDIT_ACTIONS.CATALOG_OWNERSHIP_TRANSFERRED).toBe("data.catalog_ownership_transferred");
  });

  it("defines DATASET_OWNERSHIP_TRANSFERRED action", () => {
    expect(AUDIT_ACTIONS.DATASET_OWNERSHIP_TRANSFERRED).toBe("data.dataset_ownership_transferred");
  });

  // System configuration
  it("defines FEATURE_FLAG_CHANGED action", () => {
    expect(AUDIT_ACTIONS.FEATURE_FLAG_CHANGED).toBe("system.feature_flag_changed");
  });

  it("defines SETTINGS_CHANGED action", () => {
    expect(AUDIT_ACTIONS.SETTINGS_CHANGED).toBe("system.settings_changed");
  });

  // Import admin operations
  it("defines IMPORT_JOB_STAGE_OVERRIDE action", () => {
    expect(AUDIT_ACTIONS.IMPORT_JOB_STAGE_OVERRIDE).toBe("import.job_stage_override");
  });

  it("defines SCHEDULED_IMPORT_ADMIN_MODIFIED action", () => {
    expect(AUDIT_ACTIONS.SCHEDULED_IMPORT_ADMIN_MODIFIED).toBe("import.scheduled_import_admin_modified");
  });
});

describe.sequential("auditLog", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = { create: vi.fn().mockResolvedValue({ id: 1 }) };
  });

  it("creates an audit log entry with hashed email", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.EMAIL_CHANGED, userId: 42, userEmail: "user@example.com" });

    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "audit-log",
        data: expect.objectContaining({
          action: "account.email_changed",
          userId: 42,
          userEmailHash: hashEmail("user@example.com"),
        }),
        overrideAccess: true,
      })
    );
  });

  it("hashes the email using SHA-256", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.EMAIL_CHANGED, userId: 1, userEmail: "test@example.com" });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.userEmailHash).toBe("973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b");
  });

  it("stores raw IP address AND its hash when ipAddress is provided", async () => {
    await auditLog(mockPayload, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      userId: 5,
      userEmail: "user@example.com",
      ipAddress: "192.168.1.1",
    });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.ipAddress).toBe("192.168.1.1");
    expect(callData.ipAddressHash).toBe(hashIpAddress("192.168.1.1"));
  });

  it("omits ipAddress and ipAddressHash when ipAddress is not provided", async () => {
    await auditLog(mockPayload, {
      action: AUDIT_ACTIONS.DELETION_SCHEDULED,
      userId: 10,
      userEmail: "user@example.com",
    });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.ipAddress).toBeUndefined();
    expect(callData.ipAddressHash).toBeUndefined();
  });

  it("omits performedBy when not provided", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.EMAIL_CHANGED, userId: 7, userEmail: "user@example.com" });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.performedBy).toBeUndefined();
  });

  it("includes performedBy when provided", async () => {
    await auditLog(mockPayload, {
      action: AUDIT_ACTIONS.DELETION_EXECUTED,
      userId: 7,
      userEmail: "user@example.com",
      performedBy: 1,
    });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.performedBy).toBe(1);
  });

  it("includes details when provided", async () => {
    const details = { oldEmail: "old@example.com", newEmail: "new@example.com" };

    await auditLog(mockPayload, {
      action: AUDIT_ACTIONS.EMAIL_CHANGED,
      userId: 3,
      userEmail: "new@example.com",
      details,
    });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.details).toEqual(details);
  });

  it("omits details when not provided", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.EMAIL_CHANGED, userId: 3, userEmail: "user@example.com" });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.details).toBeUndefined();
  });

  it("includes a timestamp in ISO format", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.DELETION_CANCELLED, userId: 9, userEmail: "user@example.com" });

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("uses overrideAccess: true", async () => {
    await auditLog(mockPayload, { action: AUDIT_ACTIONS.EMAIL_CHANGED, userId: 1, userEmail: "user@example.com" });

    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ overrideAccess: true }));
  });

  describe("Error Handling", () => {
    it("catches errors and does NOT throw", async () => {
      mockPayload.create.mockRejectedValue(new Error("Database connection failed"));

      await expect(
        auditLog(mockPayload, { action: AUDIT_ACTIONS.PASSWORD_CHANGED, userId: 1, userEmail: "user@example.com" })
      ).resolves.toBeUndefined();
    });

    it("does not propagate errors to the caller", async () => {
      mockPayload.create.mockRejectedValue(new Error("Unexpected failure"));

      // Should complete without throwing
      const result = await auditLog(mockPayload, {
        action: AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED,
        userId: 2,
        userEmail: "user@example.com",
        ipAddress: "10.0.0.1",
      });

      expect(result).toBeUndefined();
    });
  });
});

describe.sequential("auditFieldChanges", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = { create: vi.fn().mockResolvedValue({ id: 1 }) };
  });

  it("detects a single field change and creates an audit entry", async () => {
    await auditFieldChanges(
      mockPayload,
      { previousDoc: { trustLevel: "1" }, doc: { trustLevel: "3" }, userId: 42, userEmail: "user@example.com" },
      [
        {
          action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED,
          fieldPath: "trustLevel",
          detailsFn: (oldVal, newVal) => ({ previousTrustLevel: oldVal, newTrustLevel: newVal }),
        },
      ]
    );

    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.action).toBe("admin.trust_level_changed");
    expect(callData.details).toEqual({ previousTrustLevel: "1", newTrustLevel: "3" });
  });

  it("detects multiple field changes and creates entries for each", async () => {
    await auditFieldChanges(
      mockPayload,
      {
        previousDoc: { trustLevel: "1", role: "user" },
        doc: { trustLevel: "3", role: "admin" },
        userId: 42,
        userEmail: "user@example.com",
        performedBy: 1,
      },
      [
        { action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED, fieldPath: "trustLevel" },
        { action: AUDIT_ACTIONS.ROLE_CHANGED, fieldPath: "role" },
      ]
    );

    expect(mockPayload.create).toHaveBeenCalledTimes(2);
  });

  it("skips unchanged fields", async () => {
    await auditFieldChanges(
      mockPayload,
      {
        previousDoc: { trustLevel: "2", role: "user" },
        doc: { trustLevel: "2", role: "admin" },
        userId: 42,
        userEmail: "user@example.com",
      },
      [
        { action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED, fieldPath: "trustLevel" },
        { action: AUDIT_ACTIONS.ROLE_CHANGED, fieldPath: "role" },
      ]
    );

    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    expect(mockPayload.create.mock.calls[0][0].data.action).toBe("admin.role_changed");
  });

  it("handles nested field paths", async () => {
    await auditFieldChanges(
      mockPayload,
      {
        previousDoc: { quotas: { maxFileSizeMB: 10 } },
        doc: { quotas: { maxFileSizeMB: 50 } },
        userId: 42,
        userEmail: "user@example.com",
      },
      [{ action: AUDIT_ACTIONS.QUOTA_OVERRIDDEN, fieldPath: "quotas.maxFileSizeMB" }]
    );

    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.details).toEqual({ previousValue: 10, newValue: 50 });
  });

  it("does nothing when previousDoc is undefined", async () => {
    await auditFieldChanges(
      mockPayload,
      { previousDoc: undefined, doc: { trustLevel: "3" }, userId: 42, userEmail: "user@example.com" },
      [{ action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED, fieldPath: "trustLevel" }]
    );

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("uses custom detailsFn when provided", async () => {
    const detailsFn = vi.fn().mockReturnValue({ custom: "data" });

    await auditFieldChanges(
      mockPayload,
      { previousDoc: { role: "user" }, doc: { role: "admin" }, userId: 42, userEmail: "user@example.com" },
      [{ action: AUDIT_ACTIONS.ROLE_CHANGED, fieldPath: "role", detailsFn }]
    );

    expect(detailsFn).toHaveBeenCalledWith("user", "admin");
    expect(mockPayload.create.mock.calls[0][0].data.details).toEqual({ custom: "data" });
  });

  it("uses default details (previousValue/newValue) when no detailsFn", async () => {
    await auditFieldChanges(
      mockPayload,
      { previousDoc: { role: "user" }, doc: { role: "admin" }, userId: 42, userEmail: "user@example.com" },
      [{ action: AUDIT_ACTIONS.ROLE_CHANGED, fieldPath: "role" }]
    );

    expect(mockPayload.create.mock.calls[0][0].data.details).toEqual({ previousValue: "user", newValue: "admin" });
  });

  it("correctly compares objects using deep equality", async () => {
    // Same object values — should NOT fire
    await auditFieldChanges(
      mockPayload,
      {
        previousDoc: { customQuotas: { maxEvents: 100 } },
        doc: { customQuotas: { maxEvents: 100 } },
        userId: 42,
        userEmail: "user@example.com",
      },
      [{ action: AUDIT_ACTIONS.CUSTOM_QUOTAS_CHANGED, fieldPath: "customQuotas" }]
    );

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("includes performedBy and ipAddress in audit entries", async () => {
    await auditFieldChanges(
      mockPayload,
      {
        previousDoc: { trustLevel: "1" },
        doc: { trustLevel: "3" },
        userId: 42,
        userEmail: "user@example.com",
        performedBy: 1,
        ipAddress: "10.0.0.1",
      },
      [{ action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED, fieldPath: "trustLevel" }]
    );

    const callData = mockPayload.create.mock.calls[0][0].data;
    expect(callData.userId).toBe(42);
    expect(callData.performedBy).toBe(1);
    expect(callData.ipAddress).toBe("10.0.0.1");
  });
});
