/**
 * Unit tests for quota service error propagation.
 *
 * Verifies that incrementUsage and decrementUsage properly re-throw errors
 * so callers can decide how to handle failures.
 *
 * @module
 * @category Tests
 */
import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { QuotaService } from "@/lib/services/quota-service";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** Create a chainable mock for Drizzle's .update().set().where() pattern */
const createDrizzleChainMock = (shouldReject = false, error?: Error) => {
  const whereMock = shouldReject
    ? vi.fn().mockRejectedValue(error ?? new Error("Update failed"))
    : vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  return { updateMock, setMock, whereMock };
};

const createMockPayload = (overrides?: {
  findResult?: unknown;
  drizzleShouldReject?: boolean;
  drizzleError?: Error;
}) => {
  const opts = { findResult: undefined, drizzleShouldReject: false, ...overrides };

  const usageRecord = {
    id: 1,
    user: 42,
    currentActiveSchedules: 0,
    urlFetchesToday: 0,
    fileUploadsToday: 0,
    importJobsToday: 0,
    totalEventsCreated: 5,
    currentCatalogs: 0,
    lastResetDate: new Date().toISOString(),
  };

  const findMock = vi.fn().mockResolvedValue(opts.findResult ?? { docs: [usageRecord] });
  const { updateMock, setMock, whereMock } = createDrizzleChainMock(opts.drizzleShouldReject, opts.drizzleError);

  const payload = {
    find: findMock,
    create: vi.fn().mockResolvedValue(usageRecord),
    db: { drizzle: { update: updateMock } },
  } as unknown as Payload;

  return { payload, findMock, updateMock, setMock, whereMock };
};

describe("QuotaService", () => {
  describe("getOrCreateUsageRecord", () => {
    it("should normalize relation-style user ids before querying usage", async () => {
      const { payload, findMock } = createMockPayload({ findResult: { docs: [] } });
      const service = new QuotaService(payload);

      await service.getOrCreateUsageRecord({ id: 42 });

      expect(findMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { equals: 42 } },
        })
      );
      expect(payload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user: 42 }),
        })
      );
    });
  });

  describe("incrementUsage", () => {
    it("should succeed and call drizzle update chain", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.incrementUsage(42, "totalEventsCreated", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });

    it("should re-throw when drizzle update fails", async () => {
      const dbError = new Error("Database connection lost");
      const { payload } = createMockPayload({ drizzleShouldReject: true, drizzleError: dbError });
      const service = new QuotaService(payload);

      await expect(service.incrementUsage(42, "totalEventsCreated", 1)).rejects.toThrow("Database connection lost");
    });

    it("should re-throw when getOrCreateUsageRecord fails", async () => {
      const { payload } = createMockPayload();
      (payload.find as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Find failed"));
      const service = new QuotaService(payload);

      await expect(service.incrementUsage(42, "totalEventsCreated", 1)).rejects.toThrow("Find failed");
    });

    it("should handle daily usage types", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.incrementUsage(42, "fileUploadsToday", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });
  });

  describe("decrementUsage", () => {
    it("should succeed and call drizzle update chain", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.decrementUsage(42, "totalEventsCreated", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });

    it("should re-throw when drizzle update fails", async () => {
      const dbError = new Error("Database timeout");
      const { payload } = createMockPayload({ drizzleShouldReject: true, drizzleError: dbError });
      const service = new QuotaService(payload);

      await expect(service.decrementUsage(42, "totalEventsCreated", 1)).rejects.toThrow("Database timeout");
    });
  });
});
