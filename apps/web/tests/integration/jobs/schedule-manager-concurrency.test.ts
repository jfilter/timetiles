/**
 * Integration tests for schedule manager concurrency updates.
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Catalog, ScheduledImport, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Schedule Manager Concurrency Updates", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let testCatalog: Catalog;
  let testImport: ScheduledImport;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test data
    testUser = await payload.create({
      collection: "users",
      data: {
        email: `schedule-concurrency-${Date.now()}@example.com`,
        password: "test123456",
        role: "admin",
      },
    });

    testCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Schedule Concurrency Catalog ${Date.now()}`,
        slug: `schedule-concurrency-catalog-${Date.now()}`,
        description: "Test catalog for schedule manager concurrency",
        isPublic: false,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh scheduled import for each test
    testImport = await payload.create({
      collection: "scheduled-imports",
      data: {
        name: `Schedule Test Import ${Date.now()}`,
        sourceUrl: "https://example.com/schedule-test.csv",
        catalog: testCatalog.id,
        createdBy: testUser.id,
        enabled: true,
        scheduleType: "frequency",
        frequency: "hourly",
        importNameTemplate: "Schedule {{name}} - {{date}}",
      },
    });
  });

  it("should create test scheduled import successfully", () => {
    // Verify test setup is working
    expect(testImport).toBeDefined();
    expect(testImport.id).toBeDefined();
    // Catalog can be returned as object or ID depending on Payload depth settings
    const catalogId = typeof testImport.catalog === "object" ? testImport.catalog.id : testImport.catalog;
    expect(catalogId).toBe(testCatalog.id);
    expect(testImport.enabled).toBe(true);
    expect(testImport.frequency).toBe("hourly");
  });

  // TODO: Add actual concurrency tests for schedule manager
  // - Test concurrent schedule execution prevention
  // - Test schedule locking mechanisms
  // - Test race condition handling
});
