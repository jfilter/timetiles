/**
 * Integration tests for timezone-aware schedule calculations.
 * @module
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Catalog, User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledImport,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schedule Manager Timezone Support", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      testUser: { role: "admin" },
    });
    testUser = users.testUser;

    const { catalog } = await withCatalog(testEnv, {
      name: "Schedule Timezone Catalog",
      description: "Test catalog for schedule timezone support",
      isPublic: false,
    });
    testCatalog = catalog;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it("should calculate daily nextRun using the scheduled import timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T23:30:00.000Z"));

    const { scheduledImport } = await withScheduledImport(testEnv, testCatalog.id, "https://example.com/daily.csv", {
      user: testUser,
      name: `Timezone Daily ${Date.now()}`,
      createdBy: testUser.id,
      frequency: "daily",
      additionalData: {
        timezone: "America/New_York",
      },
    });

    expect(scheduledImport.nextRun).toBe("2024-01-16T05:00:00.000Z");
  });

  it("should trigger cron schedules based on the configured timezone instead of UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-16T04:00:00.000Z"));

    const { scheduledImport } = await withScheduledImport(testEnv, testCatalog.id, "https://example.com/cron.csv", {
      user: testUser,
      name: `Timezone Cron ${Date.now()}`,
      createdBy: testUser.id,
      scheduleType: "cron",
      cronExpression: "0 0 * * *",
      additionalData: {
        timezone: "America/New_York",
        nextRun: new Date("2024-01-16T05:00:00.000Z").toISOString(),
      },
    });

    const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

    const resultBeforeMidnight = await scheduleManagerJob.handler({
      job: { id: "test-schedule-timezone-before-midnight" },
      req: { payload },
    });

    expect(resultBeforeMidnight.output?.triggered ?? 0).toBe(0);

    vi.setSystemTime(new Date("2024-01-16T05:00:00.000Z"));

    const resultAtMidnight = await scheduleManagerJob.handler({
      job: { id: "test-schedule-timezone-at-midnight" },
      req: { payload },
    });

    expect(resultAtMidnight.output?.triggered ?? 0).toBeGreaterThanOrEqual(1);

    const updatedImport = await payload.findByID({
      collection: "scheduled-imports",
      id: scheduledImport.id,
    });

    expect(updatedImport.lastStatus).toBe("running");
    expect(updatedImport.lastRun).toBe("2024-01-16T05:00:00.000Z");
  });
});
