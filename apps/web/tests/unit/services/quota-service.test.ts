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

import { DEFAULT_QUOTAS, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { QuotaService } from "@/lib/services/quota-service";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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

/**
 * Chainable mock for Drizzle's `.insert(table).values(...).onConflictDoNothing(...).returning()`
 * used by the rewritten `getOrCreateUsageRecord`. By default the insert
 * "loses the race" (returns an empty array), so callers fall through to
 * the follow-up `payload.find` that returns the pre-existing row.
 */
const createDrizzleInsertMock = (insertedRow?: { id: number }) => {
  const returningMock = vi.fn().mockResolvedValue(insertedRow ? [insertedRow] : []);
  const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
  return { insertMock, valuesMock, onConflictMock, returningMock };
};

const createMockPayload = (overrides?: {
  findResult?: unknown;
  drizzleShouldReject?: boolean;
  drizzleError?: Error;
  /** When set, the ON CONFLICT insert "wins" and returns this row. */
  insertedRow?: { id: number };
}) => {
  const opts = { findResult: undefined, drizzleShouldReject: false, ...overrides };

  const usageRecord = {
    id: 1,
    user: 42,
    currentActiveSchedules: 0,
    urlFetchesToday: 0,
    fileUploadsToday: 0,
    ingestJobsToday: 0,
    totalEventsCreated: 5,
    currentCatalogs: 0,
    lastResetDate: new Date().toISOString(),
  };

  const findMock = vi.fn().mockResolvedValue(opts.findResult ?? { docs: [usageRecord] });
  const findByIDMock = vi.fn().mockResolvedValue(usageRecord);
  const { updateMock, setMock, whereMock } = createDrizzleChainMock(opts.drizzleShouldReject, opts.drizzleError);
  const { insertMock, valuesMock, onConflictMock, returningMock } = createDrizzleInsertMock(opts.insertedRow);

  const payload = {
    find: findMock,
    findByID: findByIDMock,
    create: vi.fn().mockResolvedValue(usageRecord),
    db: { drizzle: { update: updateMock, insert: insertMock } },
  } as unknown as Payload;

  return {
    payload,
    findMock,
    findByIDMock,
    updateMock,
    setMock,
    whereMock,
    insertMock,
    valuesMock,
    onConflictMock,
    returningMock,
  };
};

describe("QuotaService", () => {
  describe("getEffectiveQuotas", () => {
    it("falls back to regular quotas for malformed trust-level strings", () => {
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      const quotas = service.getEffectiveQuotas({ id: 42, trustLevel: "0x1", quotas: null } as never);

      expect(quotas).toEqual(DEFAULT_QUOTAS[TRUST_LEVELS.REGULAR]);
    });

    it("returns unlimited quotas (-1) for trust level 5 (UNLIMITED)", () => {
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      const quotas = service.getEffectiveQuotas({ id: 42, trustLevel: "5", quotas: null } as never);

      expect(quotas.maxUrlFetchesPerDay).toBe(-1);
      expect(quotas.maxActiveSchedules).toBe(-1);
      expect(quotas.maxFileUploadsPerDay).toBe(-1);
      expect(quotas).toEqual(DEFAULT_QUOTAS[TRUST_LEVELS.UNLIMITED]);
    });

    it("returns untrusted quotas (0) for trust level 0", () => {
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      const quotas = service.getEffectiveQuotas({ id: 42, trustLevel: "0", quotas: null } as never);

      expect(quotas.maxUrlFetchesPerDay).toBe(0);
      expect(quotas).toEqual(DEFAULT_QUOTAS[TRUST_LEVELS.UNTRUSTED]);
    });

    it("returns correct quotas for each trust level", () => {
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      for (const [, level] of Object.entries(TRUST_LEVELS)) {
        const quotas = service.getEffectiveQuotas({ id: 42, trustLevel: String(level), quotas: null } as never);
        expect(quotas).toEqual(DEFAULT_QUOTAS[level]);
      }
    });

    it("trust level upgrade overrides stale quotas snapshot", () => {
      // Bug: system user created with trustLevel "0" gets quotas { maxUrlFetchesPerDay: 0 }
      // baked into the user record. After upgrading to trustLevel "5", the stale
      // quotas.maxUrlFetchesPerDay=0 overrides the default -1 (unlimited).
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      const userWithStaleQuotas = {
        id: 42,
        trustLevel: "5", // upgraded to UNLIMITED
        quotas: {
          // stale snapshot from when trustLevel was "0" (UNTRUSTED)
          maxUrlFetchesPerDay: 0,
          maxActiveSchedules: 0,
          maxFileUploadsPerDay: 1,
          maxEventsPerImport: 100,
          maxTotalEvents: 100,
          maxIngestJobsPerDay: 0,
          maxFileSizeMB: 1,
          maxCatalogsPerUser: 0,
          maxScraperRepos: 0,
          maxScraperRunsPerDay: 0,
        },
      } as never;

      const quotas = service.getEffectiveQuotas(userWithStaleQuotas);

      // Should return UNLIMITED quotas, not the stale snapshot
      expect(quotas.maxUrlFetchesPerDay).toBe(-1);
      expect(quotas.maxActiveSchedules).toBe(-1);
      expect(quotas).toEqual(DEFAULT_QUOTAS[TRUST_LEVELS.UNLIMITED]);
    });

    it("customQuotas override trust level defaults", () => {
      const { payload } = createMockPayload();
      const service = new QuotaService(payload);

      const user = {
        id: 42,
        trustLevel: "2", // REGULAR: maxUrlFetchesPerDay=20
        quotas: null,
        customQuotas: { maxUrlFetchesPerDay: 50 },
      } as never;

      const quotas = service.getEffectiveQuotas(user);

      expect(quotas.maxUrlFetchesPerDay).toBe(50);
      // Other quotas should still use REGULAR defaults
      expect(quotas.maxFileUploadsPerDay).toBe(DEFAULT_QUOTAS[TRUST_LEVELS.REGULAR].maxFileUploadsPerDay);
    });
  });

  describe("getOrCreateUsageRecord", () => {
    it("normalizes relation-style user ids and uses atomic ON CONFLICT insert", async () => {
      // The "losing" path: insert returns nothing → fall back to find the row
      // another concurrent caller already created.
      const { payload, findMock, valuesMock, onConflictMock, returningMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.getOrCreateUsageRecord({ id: 42 });

      // Insert was issued with user=42, ON CONFLICT(user), and RETURNING.
      expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ user: 42 }));
      expect(onConflictMock).toHaveBeenCalled();
      expect(returningMock).toHaveBeenCalled();

      // Because the mock insert returns [], we fall through to find() to read
      // the concurrently-created row.
      expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { equals: 42 } } }));

      // The legacy find-then-create path is gone, so payload.create must not
      // be used for upserting user-usage anymore.
      expect(payload.create).not.toHaveBeenCalled();
    });

    it("uses findByID when the insert wins the race (fresh row)", async () => {
      // The "winning" path: insert returns the freshly-created row; we then
      // re-fetch via findByID to hydrate the Payload doc shape.
      const { payload, findByIDMock, findMock } = createMockPayload({ insertedRow: { id: 99 } });
      const service = new QuotaService(payload);

      await service.getOrCreateUsageRecord({ id: 42 });

      expect(findByIDMock).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }));
      // find() (the "already existed" path) must not be reached.
      expect(findMock).not.toHaveBeenCalled();
    });

    it("rejects non-decimal numeric user ids before touching the DB", async () => {
      const { payload, findMock, insertMock } = createMockPayload();
      const service = new QuotaService(payload);

      await expect(service.getOrCreateUsageRecord("42e1")).rejects.toThrow("Invalid user ID for quota tracking: 42e1");
      expect(findMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe("incrementUsage", () => {
    it("should succeed and call drizzle update chain", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.incrementUsage(42, "TOTAL_EVENTS", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });

    it("should re-throw when drizzle update fails", async () => {
      const dbError = new Error("Database connection lost");
      const { payload } = createMockPayload({ drizzleShouldReject: true, drizzleError: dbError });
      const service = new QuotaService(payload);

      await expect(service.incrementUsage(42, "TOTAL_EVENTS", 1)).rejects.toThrow("Database connection lost");
    });

    it("should re-throw when getOrCreateUsageRecord fails", async () => {
      // Mock the ON CONFLICT insert chain to reject — this is the first DB
      // op getOrCreateUsageRecord issues in its rewritten form.
      const { payload, returningMock } = createMockPayload();
      returningMock.mockRejectedValue(new Error("Insert failed"));
      const service = new QuotaService(payload);

      await expect(service.incrementUsage(42, "TOTAL_EVENTS", 1)).rejects.toThrow("Insert failed");
    });

    it("should handle daily usage types", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.incrementUsage(42, "FILE_UPLOADS_PER_DAY", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });
  });

  describe("decrementUsage", () => {
    it("should succeed and call drizzle update chain", async () => {
      const { payload, updateMock, setMock, whereMock } = createMockPayload();
      const service = new QuotaService(payload);

      await service.decrementUsage(42, "TOTAL_EVENTS", 1);

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });

    it("should re-throw when drizzle update fails", async () => {
      const dbError = new Error("Database timeout");
      const { payload } = createMockPayload({ drizzleShouldReject: true, drizzleError: dbError });
      const service = new QuotaService(payload);

      await expect(service.decrementUsage(42, "TOTAL_EVENTS", 1)).rejects.toThrow("Database timeout");
    });
  });
});
