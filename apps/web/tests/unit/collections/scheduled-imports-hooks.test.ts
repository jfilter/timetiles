/**
 * Unit tests for scheduled import quota tracking hooks.
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

vi.mock("@/lib/services/quota-service", () => ({
  getQuotaService: vi.fn(() => ({
    checkQuota: quotaMocks.mockCheckQuota,
    incrementUsage: quotaMocks.mockIncrementUsage,
    decrementUsage: quotaMocks.mockDecrementUsage,
  })),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import ScheduledImports from "@/lib/collections/scheduled-imports";

const afterChangeHook = ScheduledImports.hooks?.afterChange?.[0];
const afterDeleteHook = ScheduledImports.hooks?.afterDelete?.[0];

if (!afterChangeHook || !afterDeleteHook) {
  throw new Error("Scheduled import quota hooks are not configured");
}

describe.sequential("scheduled-imports quota hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaMocks.mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 1, limit: 1 });
    quotaMocks.mockIncrementUsage.mockResolvedValue(undefined);
    quotaMocks.mockDecrementUsage.mockResolvedValue(undefined);
  });

  it("propagates quota increment failures on create", async () => {
    quotaMocks.mockIncrementUsage.mockRejectedValue(new Error("quota increment failed"));

    await expect(
      afterChangeHook({
        doc: { enabled: true },
        operation: "create",
        req: { user: { id: 1 }, payload: {} },
      } as never)
    ).rejects.toThrow("quota increment failed");
  });

  it("propagates quota decrement failures on delete", async () => {
    quotaMocks.mockDecrementUsage.mockRejectedValue(new Error("quota decrement failed"));

    await expect(
      afterDeleteHook({
        doc: { enabled: true },
        req: { user: { id: 1 }, payload: {} },
      } as never)
    ).rejects.toThrow("quota decrement failed");
  });
});
