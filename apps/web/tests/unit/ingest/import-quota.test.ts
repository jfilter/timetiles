/**
 * Unit tests for the import quota check.
 *
 * @module
 * @category Tests
 */
const mocks = vi.hoisted(() => ({ checkQuota: vi.fn() }));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: () => ({ checkQuota: mocks.checkQuota }) }));

import type { Payload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkImportQuota } from "@/lib/ingest/import-quota";
import type { User } from "@/payload-types";

describe("checkImportQuota", () => {
  const payload = {} as Payload;
  const user = { id: 1 } as User;

  beforeEach(() => {
    mocks.checkQuota.mockReset();
  });

  it("skips the total-events limit for an import that creates no events", async () => {
    mocks.checkQuota.mockResolvedValue({ allowed: true, current: 0, limit: 1000 });

    await expect(checkImportQuota(payload, user, 40, 0)).resolves.toEqual({ allowed: true });
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
    expect(mocks.checkQuota).toHaveBeenCalledWith(user, "EVENTS_PER_IMPORT", 40);
  });

  it("reports the total-events limit when new events would exceed it", async () => {
    mocks.checkQuota
      .mockResolvedValueOnce({ allowed: true, current: 0, limit: 1000 })
      .mockResolvedValueOnce({ allowed: false, current: 990, limit: 1000 });

    await expect(checkImportQuota(payload, user, 40, 20)).resolves.toEqual({
      allowed: false,
      current: 990,
      limit: 1000,
      estimatedNew: 20,
      reason: "Creating 20 events would exceed your total events limit (990/1000).",
    });
    expect(mocks.checkQuota).toHaveBeenLastCalledWith(user, "TOTAL_EVENTS", 20);
  });
});
