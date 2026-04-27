// @vitest-environment node
/**
 * Integration tests for access control edge cases.
 *
 * Tests various edge cases and complex scenarios in the access control system:
 * - Orphaned resources (deleted parent relationships)
 * - Relationship-based access (accessing through references)
 * - Concurrent modification scenarios
 * - Null/undefined ownership cases
 * - Cascading permission changes
 *
 * @module
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withIngestFile,
  withScheduledIngest,
  withUsers,
} from "@/tests/setup/integration/environment";

const FORBIDDEN = /Forbidden|not allowed|not found|permission/i;

/**
 * Edge case tests for access control.
 * Refactored to avoid triggering job processing hooks.
 */
describe.sequential("Access Control Edge Cases", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;

  // Test users
  let adminUser: User;
  let ownerUser: User;
  let otherUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
    // Upload dir is automatically created and cleaned up by testEnv

    // Create test users using withUsers helper
    const { users } = await withUsers(testEnv, {
      admin: { role: "admin" },
      owner: { role: "user" },
      other: { role: "user" },
    });
    adminUser = users.admin;
    ownerUser = users.owner;
    otherUser = users.other;
  }, 60000);

  afterEach(async () => {
    // Clean up test data between tests to prevent accumulation
    // Only delete non-user collections to avoid recreating users
    try {
      await payload.delete({ collection: "ingest-jobs", where: {}, overrideAccess: true });
      await payload.delete({ collection: "ingest-files", where: {}, overrideAccess: true });
      await payload.delete({ collection: "events", where: {}, overrideAccess: true });
      await payload.delete({ collection: "datasets", where: {}, overrideAccess: true });
      await payload.delete({ collection: "catalogs", where: {}, overrideAccess: true });
      await payload.delete({ collection: "scheduled-ingests", where: {}, overrideAccess: true });
      // Clean up user-usage to reset quota counters
      await payload.delete({ collection: "user-usage", where: {}, overrideAccess: true });
    } catch {
      // Ignore errors if collections are empty
    }
  }, 10000);

  afterAll(async () => {
    await cleanup();
  });

  describe("Orphaned Resources", () => {
    // Events and datasets use denormalized access fields (`datasetIsPublic`,
    // `catalogOwnerId`, `isPublic`) — orphaned children stay readable based on
    // their frozen flags rather than re-checking the now-deleted parent.
    it("keeps a public event readable to other users after its parent dataset is deleted", async () => {
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Catalog for Orphan Test", isPublic: true },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Dataset to be deleted", catalog: catalog.id, language: "eng", isPublic: true },
        user: adminUser,
      });

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "orphaned event" },
          transformedData: { test: "orphaned event" },
          uniqueId: `${dataset.id}:test:orphan-${Date.now()}`,
        },
        user: adminUser,
      });

      await payload.delete({ collection: "datasets", id: dataset.id, user: adminUser, overrideAccess: false });

      const orphanedRead = await payload.findByID({
        collection: "events",
        id: event.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(orphanedRead.id).toBe(event.id);

      const adminEvent = await payload.findByID({
        collection: "events",
        id: event.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminEvent.id).toBe(event.id);
    });

    it("keeps a public dataset readable to other users after its parent catalog is deleted", async () => {
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Catalog to be deleted", isPublic: true },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Orphaned Dataset", catalog: catalog.id, language: "eng", isPublic: true },
        user: adminUser,
      });

      await payload.delete({ collection: "catalogs", id: catalog.id, user: adminUser, overrideAccess: false });

      const orphanedRead = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(orphanedRead.id).toBe(dataset.id);

      const adminDataset = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminDataset.id).toBe(dataset.id);
    });
  });

  describe("Relationship-Based Access", () => {
    it("should enforce access control through import-job → ingest-file → user chain", async () => {
      console.log("[TEST] Starting import-job access control test");

      // Create catalog owned by ownerUser (who will create the import file)
      console.log("[TEST] Creating catalog...");
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Import Test Catalog", isPublic: false },
        user: ownerUser,
      });
      console.log(`[TEST] Catalog created: ${catalog.id}`);

      console.log("[TEST] Creating dataset...");
      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Import Test Dataset", catalog: catalog.id, language: "eng", isPublic: false },
        user: adminUser,
      });
      console.log(`[TEST] Dataset created: ${dataset.id}`);

      // Create import file as ownerUser using helper
      console.log("[TEST] Creating import file...");
      const csvContent = "name,date\nTest Event,2024-01-01";
      const { ingestFile } = await withIngestFile(testEnv, catalog.id, csvContent, {
        filename: "test.csv",
        user: ownerUser.id,
        triggerWorkflow: true,
      });
      console.log(`[TEST] Import file created: ${ingestFile.id}`);

      // Wait for file to be written and hook to trigger
      console.log("[TEST] Waiting for hooks to complete...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Process the dataset-detection job queued by ingest-files afterChange hook
      console.log("[TEST] Running queued jobs...");
      try {
        await payload.jobs.run({ allQueues: true, limit: 10 });
        console.log("[TEST] Jobs completed");
      } catch (error) {
        console.error("[TEST] Job execution error:", error);
        throw error;
      }

      // Create import job linked to the import file (admin only)
      console.log("[TEST] Creating import job...");
      const ingestJob = await payload.create({
        collection: "ingest-jobs",
        data: {
          ingestFile: ingestFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
          progress: { current: 0, total: 100 },
        },
        user: adminUser,
      });
      console.log(`[TEST] Import job created: ${ingestJob.id}`);

      // otherUser should NOT be able to access the import job
      console.log("[TEST] Testing otherUser access (should fail)...");
      await expect(
        payload.findByID({ collection: "ingest-jobs", id: ingestJob.id, user: otherUser, overrideAccess: false })
      ).rejects.toThrow(FORBIDDEN);
      console.log("[TEST] otherUser correctly denied");

      // ownerUser CAN access (they own the import file, regardless of dataset visibility)
      console.log("[TEST] Testing ownerUser access (should succeed - file owner)...");
      const ownerJob = await payload.findByID({
        collection: "ingest-jobs",
        id: ingestJob.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerJob.id).toBe(ingestJob.id);
      console.log("[TEST] ownerUser correctly granted access as file owner");

      // adminUser should be able to access
      console.log("[TEST] Testing adminUser access (should succeed)...");
      const adminJob = await payload.findByID({
        collection: "ingest-jobs",
        id: ingestJob.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminJob.id).toBe(ingestJob.id);
      console.log("[TEST] adminUser correctly granted access");
      console.log("[TEST] Test complete");
    }, 60000);

    it("should handle import file access based on user relationship", async () => {
      // Create import file as ownerUser using helper
      const csvContent = "name,date\nOwner Event,2024-01-01";
      const { ingestFile } = await withIngestFile(testEnv, null, csvContent, {
        filename: "owner-file.csv",
        user: ownerUser.id,
        triggerWorkflow: true,
      });

      // Wait for hooks to complete and process jobs
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await payload.jobs.run({ allQueues: true });

      // otherUser should not be able to read it
      await expect(
        payload.findByID({ collection: "ingest-files", id: ingestFile.id, user: otherUser, overrideAccess: false })
      ).rejects.toThrow(FORBIDDEN);

      // ownerUser should be able to read it
      const ownerFile = await payload.findByID({
        collection: "ingest-files",
        id: ingestFile.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerFile.id).toBe(ingestFile.id);

      // otherUser should not be able to update it
      await expect(
        payload.update({
          collection: "ingest-files",
          id: ingestFile.id,
          data: { status: "completed" },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow(FORBIDDEN);

      // ownerUser should be able to update it
      const updated = await payload.update({
        collection: "ingest-files",
        id: ingestFile.id,
        data: { status: "completed" },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(updated.status).toBe("completed");
    });
  });

  describe("Cascading Permission Changes", () => {
    it("should affect access when catalog visibility changes", async () => {
      // Create public catalog and dataset
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Initially Public Catalog", isPublic: true },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Dataset in Catalog", catalog: catalog.id, language: "eng", isPublic: true },
        user: ownerUser,
      });

      // otherUser can access the dataset (public dataset)
      const datasetBefore = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(datasetBefore.id).toBe(dataset.id);

      // Make dataset private (catalog must be private first)
      await payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { isPublic: false },
        user: adminUser,
        overrideAccess: false,
      });

      // Update dataset to private
      await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { isPublic: false },
        user: adminUser,
        overrideAccess: false,
      });

      // Now otherUser should NOT be able to access the dataset
      await expect(
        payload.findByID({ collection: "datasets", id: dataset.id, user: otherUser, overrideAccess: false })
      ).rejects.toThrow(FORBIDDEN);

      // ownerUser CAN access their own private datasets (owner access)
      const ownerDataset = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerDataset.id).toBe(dataset.id);

      // Admin should also have access to private datasets
      const adminDataset = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminDataset.id).toBe(dataset.id);
    });

    it("should prevent private dataset in public catalog", async () => {
      // Create public catalog
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Public Catalog for Visibility Test", isPublic: true },
        user: adminUser,
      });

      // Attempting to create a private dataset in a public catalog should fail
      // This is a security measure to prevent privacy cascade violations
      await expect(
        payload.create({
          collection: "datasets",
          data: { name: "Cannot Be Private Dataset", catalog: catalog.id, language: "eng", isPublic: false },
          user: adminUser,
        })
      ).rejects.toThrow("Datasets in public catalogs must be public");

      // Creating a public dataset in a public catalog should succeed
      const publicDataset = await payload.create({
        collection: "datasets",
        data: { name: "Public Dataset", catalog: catalog.id, language: "eng", isPublic: true },
        user: adminUser,
      });

      // otherUser should be able to access public dataset in public catalog
      const datasetAfter = await payload.findByID({
        collection: "datasets",
        id: publicDataset.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(datasetAfter.id).toBe(publicDataset.id);
    });
  });

  describe("Concurrent Access Scenarios", () => {
    it("should handle simultaneous reads by multiple users", async () => {
      // Create public catalog and dataset
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Concurrent Access Catalog", isPublic: true },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Concurrent Access Dataset", catalog: catalog.id, language: "eng", isPublic: true },
        user: adminUser,
      });

      // Simulate concurrent reads of public dataset
      const [read1, read2, read3] = await Promise.all([
        payload.findByID({ collection: "datasets", id: dataset.id, user: ownerUser, overrideAccess: false }),
        payload.findByID({ collection: "datasets", id: dataset.id, user: otherUser, overrideAccess: false }),
        payload.findByID({ collection: "datasets", id: dataset.id, user: adminUser, overrideAccess: false }),
      ]);

      expect(read1.id).toBe(dataset.id);
      expect(read2.id).toBe(dataset.id);
      expect(read3.id).toBe(dataset.id);
    });

    it("should prevent race condition in ownership checks", async () => {
      // Create private catalog
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Race Condition Test Catalog", isPublic: false },
        user: ownerUser,
      });

      // Try concurrent updates - regular users should fail, only admin succeeds
      const updatePromises = [
        (async () => {
          try {
            return await payload.update({
              collection: "catalogs",
              id: catalog.id,
              data: { name: "Updated by Admin" },
              user: adminUser,
              overrideAccess: false,
            });
          } catch (error: unknown) {
            return { error };
          }
        })(),
        (async () => {
          try {
            return await payload.update({
              collection: "catalogs",
              id: catalog.id,
              data: { name: "Updated by Other" },
              user: otherUser,
              overrideAccess: false,
            });
          } catch (error: unknown) {
            return { error };
          }
        })(),
      ];

      const results = await Promise.all(updatePromises);

      // Admin should succeed, other should fail
      const succeeded = results.filter((r) => !("error" in r));
      const failed = results.filter((r) => "error" in r);

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });

  describe("Null and Undefined Ownership", () => {
    it("should handle catalog with null createdBy field", async () => {
      // Try to create catalog without user context (system operation)
      // This might fail depending on beforeChange hooks
      let catalog: any;
      try {
        catalog = await payload.create({
          collection: "catalogs",
          data: {
            name: "System Catalog",
            isPublic: true,
            // No createdBy - testing null ownership
          },
        });
      } catch (error) {
        // If creation fails, that's also valid (enforcing user requirement)
        expect(error).toBeDefined();
        return;
      }

      // If creation succeeds, test access
      // Public catalog should be readable by everyone
      const result = await payload.findByID({
        collection: "catalogs",
        id: catalog.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(result.id).toBe(catalog.id);

      // But who can update it if no owner?
      // Only admins should be able to update
      await expect(
        payload.update({
          collection: "catalogs",
          id: catalog.id,
          data: { name: "Hacked System Catalog" },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow(FORBIDDEN);

      const unchanged = await payload.findByID({ collection: "catalogs", id: catalog.id, overrideAccess: true });
      expect(unchanged.name).toBe("System Catalog");

      // Admin should be able to update
      const updated = await payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { name: "Admin Updated System Catalog" },
        user: adminUser,
        overrideAccess: false,
      });
      expect(updated.name).toBe("Admin Updated System Catalog");
    });

    // Note: Session-based unauthenticated uploads are no longer supported.
    // All import files now require an authenticated user (withIngestFile creates one automatically).
  });

  describe("Complex Relationship Chains", () => {
    it("should enforce access through event → dataset → catalog chain", async () => {
      console.log("[CHAIN TEST] Step 1: Creating catalog...");
      // Create private catalog hierarchy (admin creates it, so only admin can access)
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Chain Test Catalog", isPublic: false },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 1 done: catalog ${catalog.id}`);

      console.log("[CHAIN TEST] Step 2: Creating dataset...");
      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Private Chain Test Dataset", catalog: catalog.id, language: "eng", isPublic: false },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 2 done: dataset ${dataset.id}`);

      console.log("[CHAIN TEST] Step 3: Creating event...");
      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "chain test" },
          transformedData: { test: "chain test" },
          uniqueId: `${dataset.id}:test:chain-${Date.now()}`,
        },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 3 done: event ${event.id}`);

      console.log("[CHAIN TEST] Step 4: Testing otherUser access...");
      // otherUser should not access event (private dataset - admin only)
      await expect(
        payload.findByID({ collection: "events", id: event.id, user: otherUser, overrideAccess: false })
      ).rejects.toThrow(FORBIDDEN);
      console.log("[CHAIN TEST] Step 4 done: otherUser correctly denied");

      console.log("[CHAIN TEST] Step 5: Testing ownerUser access...");
      // ownerUser also should not access (admin-only for private data)
      await expect(
        payload.findByID({ collection: "events", id: event.id, user: ownerUser, overrideAccess: false })
      ).rejects.toThrow(FORBIDDEN);
      console.log("[CHAIN TEST] Step 5 done: ownerUser correctly denied");

      console.log("[CHAIN TEST] Step 6: Making catalog public...");
      // Make catalog public first
      await payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { isPublic: true },
        user: adminUser,
        overrideAccess: false,
      });
      console.log("[CHAIN TEST] Step 6 done");

      console.log("[CHAIN TEST] Step 7: Making dataset public...");
      // Make dataset public (requires admin since it was private)
      await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { isPublic: true },
        user: adminUser,
        overrideAccess: false,
      });
      console.log("[CHAIN TEST] Step 7 done");

      console.log("[CHAIN TEST] Step 8: Testing otherUser access to public event...");
      // Now otherUser can access (public dataset = public events)
      const publicEvent = await payload.findByID({
        collection: "events",
        id: event.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(publicEvent.id).toBe(event.id);
      console.log("[CHAIN TEST] Step 8 done: test complete!");
    }, 60000);
  });

  describe("scheduled ingest Access Control", () => {
    it("should validate catalog access when creating scheduled ingest", async () => {
      // Create private catalog (admin only)
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private scheduled ingest Catalog", isPublic: false },
        user: adminUser,
      });

      // otherUser should not be able to create scheduled ingest for private catalog
      await expect(
        withScheduledIngest(testEnv, privateCatalog.id, "https://example.com/data.csv", {
          name: "Unauthorized scheduled ingest",
          frequency: "daily",
          enabled: false,
          user: otherUser,
        })
      ).rejects.toThrow(FORBIDDEN);

      // Admin should be able to create scheduled ingest in private catalog
      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        privateCatalog.id,
        "https://example.com/data.csv",
        { name: "Authorized scheduled ingest", frequency: "daily", enabled: false, user: adminUser }
      );
      expect(scheduledIngest.name).toBe("Authorized scheduled ingest");
    }, 60000);
  });
});
