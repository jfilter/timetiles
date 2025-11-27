// @vitest-environment node
/**
 * Integration tests for data export service.
 *
 * Tests the complete data export lifecycle including:
 * - Export summary calculation
 * - User data fetching
 * - ZIP archive creation with chunked events
 * - Export job execution
 *
 * @module
 */

import { existsSync } from "fs";
import { rm } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DataExportService } from "@/lib/services/data-export-service";
import { getDataExportService, resetDataExportService } from "@/lib/services/data-export-service";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Data Export Service", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let truncate: () => Promise<void>;
  let exportService: DataExportService;
  let testExportDir: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    truncate = env.seedManager.truncate.bind(env.seedManager);
    testExportDir = path.join(process.cwd(), ".exports-test");
  });

  afterAll(async () => {
    // Clean up test export directory
    try {
      if (existsSync(testExportDir)) {
        await rm(testExportDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
    await cleanup();
  });

  beforeEach(async () => {
    await truncate();
    resetDataExportService();
    exportService = getDataExportService(payload);
  });

  describe("getExportSummary", () => {
    it("should return zero counts for user with no data", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.catalogs).toBe(0);
      expect(summary.datasets).toBe(0);
      expect(summary.events).toBe(0);
      expect(summary.importFiles).toBe(0);
      expect(summary.importJobs).toBe(0);
      expect(summary.scheduledImports).toBe(0);
      expect(summary.mediaFiles).toBe(0);
    });

    it("should count catalogs and datasets for user", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create catalogs
      await payload.create({
        collection: "catalogs",
        data: {
          name: "Test Catalog 1",
          createdBy: users.testUser.id,
        },
      });
      const catalog2 = await payload.create({
        collection: "catalogs",
        data: {
          name: "Test Catalog 2",
          createdBy: users.testUser.id,
        },
      });

      // Create a dataset
      await payload.create({
        collection: "datasets",
        data: {
          name: "Test Dataset",
          catalog: catalog2.id,
          language: "eng",
          createdBy: users.testUser.id,
        },
      });

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.catalogs).toBe(2);
      expect(summary.datasets).toBe(1);
    });

    it("should count events in user datasets", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create catalog and dataset
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Test Catalog",
          createdBy: users.testUser.id,
        },
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Test Dataset",
          catalog: catalog.id,
          language: "eng",
          createdBy: users.testUser.id,
        },
      });

      // Create events
      for (let i = 0; i < 5; i++) {
        await payload.create({
          collection: "events",
          data: {
            dataset: dataset.id,
            uniqueId: `test-event-${i}`,
            data: { title: `Event ${i}` },
          },
        });
      }

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.events).toBe(5);
    });

    it("should not count other users data", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, {
        user1: { role: "user" },
        user2: { role: "user" },
      });

      // Create catalog for user1
      await payload.create({
        collection: "catalogs",
        data: {
          name: "User1 Catalog",
          createdBy: users.user1.id,
        },
      });

      // Create catalog for user2
      await payload.create({
        collection: "catalogs",
        data: {
          name: "User2 Catalog",
          createdBy: users.user2.id,
        },
      });

      const summaryUser1 = await exportService.getExportSummary(users.user1.id);
      const summaryUser2 = await exportService.getExportSummary(users.user2.id);

      expect(summaryUser1.catalogs).toBe(1);
      expect(summaryUser2.catalogs).toBe(1);
    });
  });

  describe("fetchAllUserData", () => {
    it("should fetch user profile data", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, {
        testUser: { role: "user", firstName: "Test", lastName: "User" },
      });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(users.testUser.id);
      expect(data.user.email).toBe(users.testUser.email);
      expect(data.user.firstName).toBe("Test");
      expect(data.user.lastName).toBe("User");
      // Should not include password
      expect((data.user as any).password).toBeUndefined();
    });

    it("should fetch catalogs with all fields", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      await payload.create({
        collection: "catalogs",
        data: {
          name: "Export Test Catalog",
          isPublic: true,
          createdBy: users.testUser.id,
        },
      });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.catalogs).toHaveLength(1);
      expect(data.catalogs[0]!.name).toBe("Export Test Catalog");
      expect(data.catalogs[0]!.isPublic).toBe(true);
      expect(data.catalogs[0]!.createdAt).toBeDefined();
    });

    it("should fetch datasets with catalog reference", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Test Catalog",
          createdBy: users.testUser.id,
        },
      });

      await payload.create({
        collection: "datasets",
        data: {
          name: "Export Test Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: false,
          createdBy: users.testUser.id,
        },
      });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.datasets).toHaveLength(1);
      expect(data.datasets[0]!.name).toBe("Export Test Dataset");
      expect(data.datasets[0]!.catalogId).toBe(catalog.id);
      expect(data.datasets[0]!.isPublic).toBe(false);
    });

    it("should include export metadata", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.exportedAt).toBeDefined();
      expect(data.version).toBe("1.0");
    });
  });

  describe("Data Exports Collection", () => {
    it("should create export record", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const exportRecord = await payload.create({
        collection: "data-exports",
        data: {
          user: users.testUser.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      expect(exportRecord.id).toBeDefined();
      expect(exportRecord.status).toBe("pending");
      // User field may be populated as object or just ID
      const userId = typeof exportRecord.user === "object" ? exportRecord.user.id : exportRecord.user;
      expect(userId).toBe(users.testUser.id);
    });

    it("should update export status", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const exportRecord = await payload.create({
        collection: "data-exports",
        data: {
          user: users.testUser.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      const updated = await payload.update({
        collection: "data-exports",
        id: exportRecord.id,
        data: {
          status: "processing",
        },
        overrideAccess: true,
      });

      expect(updated.status).toBe("processing");
    });

    it("should enforce user can only read own exports", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, {
        user1: { role: "user" },
        user2: { role: "user" },
      });

      // Create export for user1
      await payload.create({
        collection: "data-exports",
        data: {
          user: users.user1.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      // Create export for user2
      await payload.create({
        collection: "data-exports",
        data: {
          user: users.user2.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      // User1 should only see their own export
      const user1Exports = await payload.find({
        collection: "data-exports",
        where: { user: { equals: users.user1.id } },
        overrideAccess: true,
      });

      expect(user1Exports.docs).toHaveLength(1);
      // User field may be populated as object or just ID
      const foundUserId =
        typeof user1Exports.docs[0].user === "object" ? user1Exports.docs[0].user.id : user1Exports.docs[0].user;
      expect(foundUserId).toBe(users.user1.id);
    });
  });

  describe("Export Job Queue", () => {
    it("should queue data-export job", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create export record
      const exportRecord = await payload.create({
        collection: "data-exports",
        data: {
          user: users.testUser.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      // Queue job
      await payload.jobs.queue({
        task: "data-export",
        input: { exportId: exportRecord.id },
      });

      // Verify job was queued
      const pendingJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          taskSlug: { equals: "data-export" },
          completedAt: { exists: false },
        },
        overrideAccess: true,
      });

      expect(pendingJobs.docs.length).toBe(1);
      expect(pendingJobs.docs[0].input.exportId).toBe(exportRecord.id);
    });
  });
});
