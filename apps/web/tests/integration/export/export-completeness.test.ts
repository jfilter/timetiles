// @vitest-environment node
/**
 * Integration tests for GDPR export completeness.
 *
 * Verifies that `getExportSummary()` and `fetchAllUserData()` include ALL
 * user-owned collections, particularly the 5 that were previously missing:
 * dataset-schemas, audit-log, scraper-repos, scrapers, scraper-runs.
 *
 * Tests use unique user IDs to avoid cross-test interference, so no
 * collection truncation is needed.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DataExportService } from "@/lib/export/service";
import { createDataExportService } from "@/lib/export/service";
import type { ExportSummary } from "@/lib/export/types";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("GDPR Export Completeness", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let exportService: DataExportService;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    exportService = createDataExportService(payload);
  });

  /** Helper to create a catalog owned by a specific user. */
  const createCatalogForUser = async (userId: number, name?: string) =>
    payload.create({
      collection: "catalogs",
      data: { name: name ?? `Export Test Catalog ${Date.now()}`, createdBy: userId },
    });

  /** Helper to create a dataset owned by a specific user. */
  const createDatasetForUser = async (userId: number, catalogId: number, name?: string) =>
    payload.create({
      collection: "datasets",
      data: {
        name: name ?? `Export Test Dataset ${Date.now()}`,
        catalog: catalogId,
        language: "eng",
        createdBy: userId,
      },
    });

  describe("getExportSummary", () => {
    it("should include all 12 collection counts in the summary", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const summary = await exportService.getExportSummary(users.testUser.id);

      // Verify every field in ExportSummary is present (not undefined)
      const expectedKeys: (keyof ExportSummary)[] = [
        "catalogs",
        "datasets",
        "events",
        "importFiles",
        "importJobs",
        "scheduledIngests",
        "mediaFiles",
        "datasetSchemas",
        "auditLogEntries",
        "scraperRepos",
        "scrapers",
        "scraperRuns",
      ];

      for (const key of expectedKeys) {
        expect(summary).toHaveProperty(key);
        expect(typeof summary[key]).toBe("number");
      }
    });

    it("should count audit-log entries for the user", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      // Create audit-log entries directly (access is blocked by default, use overrideAccess)
      await payload.create({
        collection: "audit-log",
        data: {
          action: "account.email_changed",
          userId: users.testUser.id,
          userEmailHash: "testhash1",
          timestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      await payload.create({
        collection: "audit-log",
        data: {
          action: "account.password_changed",
          userId: users.testUser.id,
          userEmailHash: "testhash2",
          timestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.auditLogEntries).toBe(2);
    });

    it("should count dataset-schemas for user datasets", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const catalog = await createCatalogForUser(users.testUser.id);
      const dataset = await createDatasetForUser(users.testUser.id, catalog.id);

      // Create a dataset schema version
      await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: dataset.id,
          versionNumber: 1,
          schema: { type: "object", properties: { title: { type: "string" } } },
          fieldMetadata: { title: { occurrences: 100, occurrencePercent: 100 } },
          _status: "published",
        },
        overrideAccess: true,
      });

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.datasetSchemas).toBe(1);
      expect(summary.datasets).toBe(1);
    });

    it("should not count audit-log entries belonging to other users", async () => {
      const { users } = await withUsers(testEnv, { user1: { role: "user" }, user2: { role: "user" } });

      // Create audit entry for user1
      await payload.create({
        collection: "audit-log",
        data: {
          action: "account.email_changed",
          userId: users.user1.id,
          userEmailHash: "hash-user1",
          timestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      // Create audit entry for user2
      await payload.create({
        collection: "audit-log",
        data: {
          action: "account.password_changed",
          userId: users.user2.id,
          userEmailHash: "hash-user2",
          timestamp: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      const summaryUser1 = await exportService.getExportSummary(users.user1.id);
      const summaryUser2 = await exportService.getExportSummary(users.user2.id);

      expect(summaryUser1.auditLogEntries).toBe(1);
      expect(summaryUser2.auditLogEntries).toBe(1);
    });

    it("should return zero for all new collection counts when user has no data", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const summary = await exportService.getExportSummary(users.testUser.id);

      expect(summary.datasetSchemas).toBe(0);
      expect(summary.auditLogEntries).toBe(0);
      expect(summary.scraperRepos).toBe(0);
      expect(summary.scrapers).toBe(0);
      expect(summary.scraperRuns).toBe(0);
    });
  });

  describe("fetchAllUserData", () => {
    it("should include all new collection arrays in the export data", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      // Verify all collection arrays exist (including the previously missing ones)
      expect(data).toHaveProperty("datasetSchemas");
      expect(data).toHaveProperty("auditLog");
      expect(data).toHaveProperty("scraperRepos");
      expect(data).toHaveProperty("scrapers");
      expect(data).toHaveProperty("scraperRuns");

      // All should be arrays (even if empty)
      expect(Array.isArray(data.datasetSchemas)).toBe(true);
      expect(Array.isArray(data.auditLog)).toBe(true);
      expect(Array.isArray(data.scraperRepos)).toBe(true);
      expect(Array.isArray(data.scrapers)).toBe(true);
      expect(Array.isArray(data.scraperRuns)).toBe(true);
    });

    it("should fetch audit-log entries with sanitized fields (no IP addresses)", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      // Create an audit-log entry with an IP address
      await payload.create({
        collection: "audit-log",
        data: {
          action: "account.email_changed",
          userId: users.testUser.id,
          userEmailHash: "testhash",
          timestamp: new Date().toISOString(),
          ipAddress: "192.168.1.1", // eslint-disable-line sonarjs/no-hardcoded-ip -- test data
          details: { oldEmail: "old@test.com", newEmail: "new@test.com" },
        },
        overrideAccess: true,
      });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.auditLog).toHaveLength(1);
      expect(data.auditLog[0]!.action).toBe("account.email_changed");
      expect(data.auditLog[0]!.id).toBeDefined();
      expect(data.auditLog[0]!.timestamp).toBeDefined();
      expect(data.auditLog[0]!.createdAt).toBeDefined();
      // IP address should NOT be in the export data (GDPR sanitization)
      expect((data.auditLog[0] as any).ipAddress).toBeUndefined();
    });

    it("should fetch dataset schemas for user datasets", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const catalog = await createCatalogForUser(users.testUser.id);
      const dataset = await createDatasetForUser(users.testUser.id, catalog.id);

      // Create two schema versions
      await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: dataset.id,
          versionNumber: 1,
          schema: { type: "object", properties: { title: { type: "string" } } },
          fieldMetadata: { title: { occurrences: 100, occurrencePercent: 100 } },
          _status: "published",
        },
        overrideAccess: true,
      });
      await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: dataset.id,
          versionNumber: 2,
          schema: { type: "object", properties: { title: { type: "string" }, category: { type: "string" } } },
          fieldMetadata: {
            title: { occurrences: 100, occurrencePercent: 100 },
            category: { occurrences: 80, occurrencePercent: 80 },
          },
          _status: "draft",
        },
        overrideAccess: true,
      });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.datasetSchemas).toHaveLength(2);
      expect(data.datasetSchemas[0]!.datasetId).toBe(dataset.id);
      expect(data.datasetSchemas[0]!.versionNumber).toBeDefined();
      expect(data.datasetSchemas[0]!.schema).toBeDefined();
    });

    it("should include standard metadata fields", async () => {
      const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

      const data = await exportService.fetchAllUserData(users.testUser.id);

      expect(data.exportedAt).toBeDefined();
      expect(data.version).toBe("1.0");
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(users.testUser.id);
    });
  });
});
