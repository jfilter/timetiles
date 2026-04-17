/**
 * Unit tests for scheduled ingest quota tracking hooks.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const quotaMocks = vi.hoisted(() => ({
  mockCheckQuota: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockDecrementUsage: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({ auditLog: vi.fn() }));

vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkQuota: quotaMocks.mockCheckQuota,
    incrementUsage: quotaMocks.mockIncrementUsage,
    decrementUsage: quotaMocks.mockDecrementUsage,
  })),
}));

vi.mock("@/lib/services/audit-log-service", () => ({
  AUDIT_ACTIONS: { SCHEDULED_INGEST_ADMIN_MODIFIED: "scheduled-ingest-admin-modified" },
  auditLog: auditMocks.auditLog,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import ScheduledIngests from "@/lib/collections/scheduled-ingests";

const afterChangeHook = ScheduledIngests.hooks?.afterChange?.[0];
const afterDeleteHook = ScheduledIngests.hooks?.afterDelete?.[0];

if (!afterChangeHook || !afterDeleteHook) {
  throw new Error("scheduled ingest quota hooks are not configured");
}

describe.sequential("scheduled-ingests quota hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaMocks.mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 1, limit: 1 });
    quotaMocks.mockIncrementUsage.mockResolvedValue(undefined);
    quotaMocks.mockDecrementUsage.mockResolvedValue(undefined);
    auditMocks.auditLog.mockResolvedValue(undefined);
  });

  it("propagates quota increment failures on create", async () => {
    quotaMocks.mockIncrementUsage.mockRejectedValue(new Error("quota increment failed"));

    await expect(
      afterChangeHook({
        doc: { enabled: true, createdBy: 1 },
        operation: "create",
        req: { user: { id: 1 }, payload: {} },
      } as never)
    ).rejects.toThrow("quota increment failed");
  });

  it("propagates quota decrement failures on delete", async () => {
    quotaMocks.mockDecrementUsage.mockRejectedValue(new Error("quota decrement failed"));

    await expect(
      afterDeleteHook({ doc: { enabled: true, createdBy: 1 }, req: { user: { id: 1 }, payload: {} } } as never)
    ).rejects.toThrow("quota decrement failed");
  });

  it("increments ACTIVE_SCHEDULES when update enables schedule", async () => {
    await afterChangeHook({
      doc: { enabled: true, createdBy: 1 },
      previousDoc: { enabled: false },
      operation: "update",
      req: { user: { id: 1 }, payload: {} },
    } as never);

    expect(quotaMocks.mockIncrementUsage).toHaveBeenCalledWith(1, "ACTIVE_SCHEDULES", 1, expect.anything());
    expect(quotaMocks.mockDecrementUsage).not.toHaveBeenCalled();
  });

  it("decrements ACTIVE_SCHEDULES when update disables schedule", async () => {
    await afterChangeHook({
      doc: { enabled: false, createdBy: 1 },
      previousDoc: { enabled: true },
      operation: "update",
      req: { user: { id: 1 }, payload: {} },
    } as never);

    expect(quotaMocks.mockDecrementUsage).toHaveBeenCalledWith(1, "ACTIVE_SCHEDULES", 1, expect.anything());
    expect(quotaMocks.mockIncrementUsage).not.toHaveBeenCalled();
  });

  it("decrements ACTIVE_SCHEDULES when deleting an enabled schedule", async () => {
    await afterDeleteHook({ doc: { enabled: true, createdBy: 1 }, req: { user: { id: 1 }, payload: {} } } as never);

    expect(quotaMocks.mockDecrementUsage).toHaveBeenCalledWith(1, "ACTIVE_SCHEDULES", 1, expect.anything());
  });

  it("does not decrement when deleting a disabled schedule", async () => {
    await afterDeleteHook({ doc: { enabled: false, createdBy: 1 }, req: { user: { id: 1 }, payload: {} } } as never);

    expect(quotaMocks.mockDecrementUsage).not.toHaveBeenCalled();
  });

  it("audits admin modifying another user's schedule", async () => {
    const mockPayload = { findByID: vi.fn().mockResolvedValue({ email: "owner@example.com" }) };

    await afterChangeHook({
      doc: { id: 10, name: "Test Schedule", enabled: true, createdBy: 2 },
      previousDoc: { enabled: false },
      operation: "update",
      req: { user: { id: 99, role: "admin" }, payload: mockPayload },
    } as never);

    expect(auditMocks.auditLog).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({
        action: "scheduled-ingest-admin-modified",
        userId: 2,
        userEmail: "owner@example.com",
        performedBy: 99,
        details: expect.objectContaining({ scheduledIngestId: 10, scheduledIngestName: "Test Schedule" }),
      }),
      expect.objectContaining({ req: expect.any(Object) })
    );
  });
});
