/**
 * Integration tests for schedule manager concurrency updates.
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { extractRelationId } from "@/lib/utils/relation-id";
import type { Catalog, ScheduledIngest, User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledIngest,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schedule Manager Concurrency Updates", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;
  let testImport: ScheduledIngest;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    const env = testEnv;
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test data
    const { users } = await withUsers(env, { testUser: { role: "admin" } });
    testUser = users.testUser;

    const { catalog } = await withCatalog(env, {
      name: "Schedule Concurrency Catalog",
      description: "Test catalog for schedule manager concurrency",
      isPublic: false,
      user: testUser,
    });
    testCatalog = catalog;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh scheduled ingest for each test
    const { scheduledIngest } = await withScheduledIngest(
      testEnv,
      testCatalog.id,
      "https://example.com/schedule-test.csv",
      {
        user: testUser,
        name: `Schedule Test Import ${Date.now()}`,
        createdBy: testUser.id,
        frequency: "hourly",
        ingestNameTemplate: "Schedule {{name}} - {{date}}",
      }
    );
    testImport = scheduledIngest;
  });

  it("should create test scheduled ingest successfully", () => {
    // Verify test setup is working
    expect(testImport).toBeDefined();
    expect(testImport.id).toBeDefined();
    // Catalog can be returned as object or ID depending on Payload depth settings
    const catalogId = extractRelationId(testImport.catalog);
    expect(catalogId).toBe(testCatalog.id);
    expect(testImport.enabled).toBe(true);
    expect(testImport.frequency).toBe("hourly");
  });

  it("should prevent duplicate job creation when managers run concurrently", async () => {
    /**
     * Tests true concurrent execution of schedule managers.
     *
     * The concurrency protection has two layers:
     * 1. Job-level: Payload concurrency key "schedule-manager" prevents two
     *    schedule-manager jobs from running in parallel via the job queue.
     * 2. Handler-level: triggerScheduledIngest uses an atomic SQL
     *    `UPDATE ... WHERE last_status != 'running' RETURNING id` to claim
     *    the scheduled ingest. PostgreSQL row locking ensures only one
     *    concurrent transaction succeeds.
     *
     * This test bypasses layer 1 (calling the handler directly) to verify
     * that layer 2 alone prevents duplicate triggers.
     */

    // Use fake timers to control execution time
    vi.useFakeTimers();
    const baseTime = new Date("2024-01-15T10:00:00.000Z");
    vi.setSystemTime(baseTime);

    // Create a scheduled ingest with lastRun set to make it overdue
    const { scheduledIngest } = await withScheduledIngest(
      testEnv,
      testCatalog.id,
      "https://example.com/concurrent-test.csv",
      {
        user: testUser,
        name: `Concurrent Test Import ${Date.now()}`,
        createdBy: testUser.id,
        frequency: "hourly",
        ingestNameTemplate: "Concurrent {{name}} - {{date}}",
        additionalData: {
          lastRun: new Date("2024-01-15T08:30:00.000Z").toISOString(), // 1.5 hours ago
        },
      }
    );

    // Advance time to make the schedule overdue
    // Last run was 8:30 AM, next run should be 9:00 AM
    // Setting time to 11:00 AM makes it 2 hours overdue
    vi.setSystemTime(new Date("2024-01-15T11:00:00.000Z"));

    // Import the schedule manager
    const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

    // Run two schedule managers concurrently (TRUE parallel execution)
    const [run1, run2] = await Promise.all([
      scheduleManagerJob.handler({ job: { id: "test-schedule-manager-1" }, req: { payload } }),
      scheduleManagerJob.handler({ job: { id: "test-schedule-manager-2" }, req: { payload } }),
    ]);

    // Both should complete successfully
    expect(run1.output).toBeDefined();
    expect(run2.output).toBeDefined();

    // Check total triggers
    const totalTriggered = (run1.output?.triggered ?? 0) + (run2.output?.triggered ?? 0);

    // At least one should have triggered the schedule
    expect(totalTriggered).toBeGreaterThanOrEqual(1);

    // With the atomic SQL claim, exactly 1 should trigger.
    // The second handler's SQL UPDATE returns 0 rows (row already claimed),
    // so it throws and is counted as an error, not a trigger.
    expect(totalTriggered).toBe(1);

    // Verify the scheduled ingest was updated
    const updatedImport = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

    // lastStatus should be "running" (set by one or both managers)
    expect(updatedImport.lastStatus).toBe("running");
    expect(updatedImport.lastRun).toBeDefined();

    // Cleanup
    vi.useRealTimers();
  });
});
