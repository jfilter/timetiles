/**
 * Unit tests for scheduled ingest beforeChange hook.
 *
 * Tests cron-based nextRun calculation (Bug 1) and schedule initialization.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const cronMocks = vi.hoisted(() => ({ calculateNextCronRun: vi.fn() }));

// Keep original implementation as default, override in specific tests
vi.mock("@/lib/ingest/cron-parser", async (importOriginal) => {
  const original = await importOriginal();
  const realCalculateNextCronRun = original.calculateNextCronRun as (...args: unknown[]) => unknown;
  return {
    ...original,
    calculateNextCronRun: (...args: unknown[]) =>
      cronMocks.calculateNextCronRun.getMockImplementation()
        ? cronMocks.calculateNextCronRun(...args)
        : realCalculateNextCronRun(...args),
  };
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { beforeChangeHook } from "@/lib/collections/scheduled-ingests/hooks";

describe("scheduled-ingests beforeChange hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cron nextRun calculation", () => {
    it("should set nextRun when creating with cronExpression", () => {
      const data: Record<string, unknown> = {
        scheduleType: "cron",
        cronExpression: "0 12 * * *", // daily at 12:00 UTC
        enabled: true,
      };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result).toBeDefined();
      expect(result.nextRun).toBeDefined();

      // nextRun should be a valid ISO string representing 12:00 UTC
      const nextRun = new Date(result.nextRun as string);
      expect(nextRun.getUTCHours()).toBe(12);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it("should set nextRun when creating with weekly cron expression", () => {
      const data: Record<string, unknown> = {
        scheduleType: "cron",
        cronExpression: "30 8 * * 1", // Monday at 08:30 UTC
        enabled: true,
      };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result).toBeDefined();
      expect(result.nextRun).toBeDefined();

      const nextRun = new Date(result.nextRun as string);
      expect(nextRun.getUTCDay()).toBe(1); // Monday
      expect(nextRun.getUTCHours()).toBe(8);
      expect(nextRun.getUTCMinutes()).toBe(30);
    });

    it("should not overwrite existing nextRun", () => {
      const existingNextRun = "2099-01-01T00:00:00.000Z";
      const data: Record<string, unknown> = {
        scheduleType: "cron",
        cronExpression: "0 12 * * *",
        enabled: true,
        nextRun: existingNextRun,
      };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.nextRun).toBe(existingNextRun);
    });

    it("should set nextRun for frequency-based schedules", () => {
      const data: Record<string, unknown> = { scheduleType: "frequency", frequency: "daily", enabled: true };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.nextRun).toBeDefined();
    });

    it("should set nextRun for cron on update when enabling", () => {
      const data: Record<string, unknown> = {
        scheduleType: "cron",
        cronExpression: "0 6 * * *", // daily at 06:00 UTC
        enabled: true,
      };

      const result = beforeChangeHook({
        data,
        operation: "update",
        originalDoc: { enabled: false } as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.nextRun).toBeDefined();
      const nextRun = new Date(result.nextRun as string);
      expect(nextRun.getUTCHours()).toBe(6);
      expect(nextRun.getUTCMinutes()).toBe(0);
    });

    it("should clear cronExpression when scheduleType is frequency", () => {
      const data: Record<string, unknown> = {
        scheduleType: "frequency",
        frequency: "daily",
        cronExpression: "0 12 * * *",
      };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.cronExpression).toBeNull();
    });

    it("should clear frequency when scheduleType is cron", () => {
      const data: Record<string, unknown> = { scheduleType: "cron", cronExpression: "0 12 * * *", frequency: "daily" };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.frequency).toBeNull();
    });

    it("should initialize statistics on create", () => {
      const data: Record<string, unknown> = { scheduleType: "cron", cronExpression: "0 12 * * *", enabled: true };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.statistics).toEqual({ totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 });
    });
  });

  describe("webhook token management", () => {
    it("should generate a 64-char hex token on first enable", () => {
      const data: Record<string, unknown> = { webhookEnabled: true };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.webhookToken).toBeDefined();
      expect(typeof result.webhookToken).toBe("string");
      expect(result.webhookToken).toHaveLength(64);
      expect(result.webhookToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should regenerate token when re-enabling webhooks", () => {
      const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: "old-token-value" };

      const result = beforeChangeHook({
        data,
        operation: "update",
        originalDoc: { webhookEnabled: false } as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.webhookToken).toBeDefined();
      expect(result.webhookToken).not.toBe("old-token-value");
      expect(result.webhookToken).toHaveLength(64);
      expect(result.webhookToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should clear token when disabling webhooks", () => {
      const data: Record<string, unknown> = { webhookEnabled: false };

      const result = beforeChangeHook({
        data,
        operation: "update",
        originalDoc: { webhookEnabled: true } as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.webhookToken).toBeNull();
    });
  });

  describe("createdBy preservation", () => {
    it("should preserve createdBy on update", () => {
      const data: Record<string, unknown> = { scheduleType: "frequency", frequency: "daily" };

      const result = beforeChangeHook({
        data,
        operation: "update",
        originalDoc: { createdBy: 42 } as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      expect(result.createdBy).toBe(42);
    });
  });

  describe("invalid frequency", () => {
    it("should throw for invalid frequency with timezone", () => {
      const data: Record<string, unknown> = {
        scheduleType: "frequency",
        frequency: "invalid-freq",
        enabled: true,
        timezone: "Europe/Berlin",
      };

      expect(() =>
        beforeChangeHook({
          data,
          operation: "create",
          originalDoc: undefined as never,
          req: {} as never,
          context: {} as never,
          collection: {} as never,
        })
      ).toThrow("Invalid frequency: invalid-freq");
    });
  });

  describe("cron nextRun null result", () => {
    it("should handle null cron calculation gracefully", () => {
      cronMocks.calculateNextCronRun.mockImplementation(() => null);

      const data: Record<string, unknown> = { scheduleType: "cron", cronExpression: "bad", enabled: true };

      const result = beforeChangeHook({
        data,
        operation: "create",
        originalDoc: undefined as never,
        req: {} as never,
        context: {} as never,
        collection: {} as never,
      });

      // nextRun should not be set when calculateNextCronRun returns null
      // (the else branch in handleScheduleInitialization logs a warning)
      expect(result.nextRun).toBeUndefined();
    });
  });
});
