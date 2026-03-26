/**
 * Unit tests for scheduled ingests timezone support in beforeChange hook.
 *
 * Tests that the beforeChange hook correctly uses the timezone field
 * when calculating initial nextRun values.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beforeChangeHook } from "@/lib/collections/scheduled-ingests/hooks";

describe("scheduled-ingests beforeChange hook timezone support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure real timers are restored first before re-enabling fakes
    // (handles leaked fake timer state from other test files in isolate: false)
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should use timezone when calculating nextRun for cron on create", () => {
    // Set time to 2024-01-15 06:30 UTC (= 07:30 Berlin CET)
    vi.setSystemTime(new Date("2024-01-15T06:30:00Z"));

    const data: Record<string, unknown> = {
      scheduleType: "cron",
      cronExpression: "0 8 * * *", // 08:00 in Berlin
      timezone: "Europe/Berlin",
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

    expect(result.nextRun).toBeDefined();

    // Next 08:00 Berlin (CET = UTC+1) = 07:00 UTC on 2024-01-15
    const nextRun = new Date(result.nextRun as string);
    expect(nextRun.toISOString()).toBe("2024-01-15T07:00:00.000Z");
  });

  it("should use timezone when calculating nextRun for frequency on create", () => {
    // Set time to 2024-01-15 10:00 UTC (= 11:00 Berlin CET)
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const data: Record<string, unknown> = {
      scheduleType: "frequency",
      frequency: "daily",
      timezone: "Europe/Berlin",
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

    expect(result.nextRun).toBeDefined();

    // Next midnight Berlin (CET = UTC+1) = 23:00 UTC on 2024-01-15
    const nextRun = new Date(result.nextRun as string);
    expect(nextRun.toISOString()).toBe("2024-01-15T23:00:00.000Z");
  });

  it("should default to UTC when no timezone specified", () => {
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

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

    // Next midnight UTC = 2024-01-16 00:00:00 UTC
    const nextRun = new Date(result.nextRun as string);
    expect(nextRun.toISOString()).toBe("2024-01-16T00:00:00.000Z");
  });

  it("should use timezone when enabling a schedule on update", () => {
    vi.setSystemTime(new Date("2024-01-15T06:00:00Z"));

    const data: Record<string, unknown> = {
      scheduleType: "cron",
      cronExpression: "0 8 * * *",
      timezone: "Europe/Berlin",
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
    // 08:00 CET = 07:00 UTC on 2024-01-15
    expect(nextRun.toISOString()).toBe("2024-01-15T07:00:00.000Z");
  });
});
