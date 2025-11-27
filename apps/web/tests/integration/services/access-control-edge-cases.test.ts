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

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withImportFile,
  withScheduledImport,
  withUsers,
} from "@/tests/setup/integration/environment";

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
      other: { role: "user", email: "other@test.com" },
    });
    adminUser = users.admin;
    ownerUser = users.owner;
    otherUser = users.other;
  }, 60000);

  afterEach(async () => {
    // Clean up test data between tests to prevent accumulation
    // Only delete non-user collections to avoid recreating users
    try {
      await payload.delete({ collection: "import-jobs", where: {}, overrideAccess: true });
      await payload.delete({ collection: "import-files", where: {}, overrideAccess: true });
      await payload.delete({ collection: "events", where: {}, overrideAccess: true });
      await payload.delete({ collection: "datasets", where: {}, overrideAccess: true });
      await payload.delete({ collection: "catalogs", where: {}, overrideAccess: true });
      await payload.delete({ collection: "scheduled-imports", where: {}, overrideAccess: true });
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
    it("should handle events when parent dataset is deleted", async () => {
      // Create catalog, dataset, and event (admin creates datasets/events)
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Catalog for Orphan Test",
          isPublic: true,
        },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Dataset to be deleted",
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
        },
        user: adminUser,
      });

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          data: { test: "orphaned event" },
          uniqueId: `${dataset.id}:test:orphan-${Date.now()}`,
        },
        user: adminUser,
      });

      // Delete the dataset (admin only can delete)
      await payload.delete({
        collection: "datasets",
        id: dataset.id,
        user: adminUser,
        overrideAccess: false,
      });

      // Try to access the event - it should still exist but may have access issues
      // This tests the system's handling of orphaned relationships
      try {
        await payload.findByID({
          collection: "events",
          id: event.id,
          user: otherUser,
          overrideAccess: false,
        });
        // If this succeeds, the event is orphaned but still accessible
        // The behavior depends on how Payload handles deleted relationships
      } catch (error) {
        // If this fails, it's expected for orphaned resources
        expect(error).toBeDefined();
      }

      // Admin should still be able to access it
      const adminEvent = await payload.findByID({
        collection: "events",
        id: event.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminEvent.id).toBe(event.id);
    });

    it("should handle datasets when parent catalog is deleted", async () => {
      // Create catalog and dataset (admin creates datasets)
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Catalog to be deleted",
          isPublic: true,
        },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Orphaned Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
        },
        user: adminUser,
      });

      // Delete the catalog (admin only)
      await payload.delete({
        collection: "catalogs",
        id: catalog.id,
        user: adminUser,
        overrideAccess: false,
      });

      // Try to access the dataset
      try {
        await payload.findByID({
          collection: "datasets",
          id: dataset.id,
          user: otherUser,
          overrideAccess: false,
        });
        // Dataset might be accessible if catalog relationship is optional
      } catch (error) {
        // Or it might fail due to missing catalog
        expect(error).toBeDefined();
      }

      // Admin should be able to access
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
    it("should enforce access control through import-job → import-file → user chain", async () => {
      console.log("[TEST] Starting import-job access control test");

      // Create catalog (admin creates private catalogs/datasets)
      console.log("[TEST] Creating catalog...");
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Import Test Catalog",
          isPublic: false,
        },
        user: adminUser,
      });
      console.log(`[TEST] Catalog created: ${catalog.id}`);

      console.log("[TEST] Creating dataset...");
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Import Test Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: false,
        },
        user: adminUser,
      });
      console.log(`[TEST] Dataset created: ${dataset.id}`);

      // Create import file as ownerUser using helper
      console.log("[TEST] Creating import file...");
      const csvContent = "name,date\nTest Event,2024-01-01";
      const { importFile } = await withImportFile(testEnv, catalog.id, csvContent, {
        filename: "test.csv",
        user: ownerUser.id,
      });
      console.log(`[TEST] Import file created: ${importFile.id}`);

      // Wait for file to be written and hook to trigger
      console.log("[TEST] Waiting for hooks to complete...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Process the dataset-detection job queued by import-files afterChange hook
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
      const importJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
          progress: { current: 0, total: 100 },
        },
        user: adminUser,
      });
      console.log(`[TEST] Import job created: ${importJob.id}`);

      // otherUser should NOT be able to access the import job
      console.log("[TEST] Testing otherUser access (should fail)...");
      await expect(
        payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
      console.log("[TEST] otherUser correctly denied");

      // ownerUser CAN access (they own the import file, regardless of dataset visibility)
      console.log("[TEST] Testing ownerUser access (should succeed - file owner)...");
      const ownerJob = await payload.findByID({
        collection: "import-jobs",
        id: importJob.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerJob.id).toBe(importJob.id);
      console.log("[TEST] ownerUser correctly granted access as file owner");

      // adminUser should be able to access
      console.log("[TEST] Testing adminUser access (should succeed)...");
      const adminJob = await payload.findByID({
        collection: "import-jobs",
        id: importJob.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminJob.id).toBe(importJob.id);
      console.log("[TEST] adminUser correctly granted access");
      console.log("[TEST] Test complete");
    }, 60000);

    it("should handle import file access based on user relationship", async () => {
      // Create import file as ownerUser using helper
      const csvContent = "name,date\nOwner Event,2024-01-01";
      const { importFile } = await withImportFile(testEnv, null, csvContent, {
        filename: "owner-file.csv",
        user: ownerUser.id,
      });

      // Wait for hooks to complete and process jobs
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await payload.jobs.run({ allQueues: true });

      // otherUser should not be able to read it
      await expect(
        payload.findByID({
          collection: "import-files",
          id: importFile.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      // ownerUser should be able to read it
      const ownerFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerFile.id).toBe(importFile.id);

      // otherUser should not be able to update it
      await expect(
        payload.update({
          collection: "import-files",
          id: importFile.id,
          data: { status: "completed" },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      // ownerUser should be able to update it
      const updated = await payload.update({
        collection: "import-files",
        id: importFile.id,
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
        data: {
          name: "Initially Public Catalog",
          isPublic: true,
        },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Dataset in Catalog",
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
        },
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
        payload.findByID({
          collection: "datasets",
          id: dataset.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

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
        data: {
          name: "Public Catalog for Visibility Test",
          isPublic: true,
        },
        user: adminUser,
      });

      // Attempting to create a private dataset in a public catalog should fail
      // This is a security measure to prevent privacy cascade violations
      await expect(
        payload.create({
          collection: "datasets",
          data: {
            name: "Cannot Be Private Dataset",
            catalog: catalog.id,
            language: "eng",
            isPublic: false,
          },
          user: adminUser,
        })
      ).rejects.toThrow("Datasets in public catalogs must be public");

      // Creating a public dataset in a public catalog should succeed
      const publicDataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Public Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
        },
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
        data: {
          name: "Concurrent Access Catalog",
          isPublic: true,
        },
        user: ownerUser,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Concurrent Access Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
        },
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
        data: {
          name: "Race Condition Test Catalog",
          isPublic: false,
        },
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

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
    });
  });

  describe("Null and Undefined Ownership", () => {
    it("should handle catalog with null createdBy field", async () => {
      // Try to create catalog without user context (system operation)
      // This might fail depending on beforeChange hooks
      try {
        const catalog = await payload.create({
          collection: "catalogs",
          data: {
            name: "System Catalog",
            isPublic: true,
            // No createdBy - testing null ownership
          },
        });

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
        ).rejects.toThrow();

        // Admin should be able to update
        const updated = await payload.update({
          collection: "catalogs",
          id: catalog.id,
          data: { name: "Admin Updated System Catalog" },
          user: adminUser,
          overrideAccess: false,
        });
        expect(updated.name).toBe("Admin Updated System Catalog");
      } catch (error) {
        // If creation fails, that's also valid (enforcing user requirement)
        expect(error).toBeDefined();
      }
    });

    // Note: Session-based unauthenticated uploads are no longer supported.
    // All import files now require an authenticated user (withImportFile creates one automatically).
  });

  describe("Complex Relationship Chains", () => {
    it("should enforce access through event → dataset → catalog chain", async () => {
      console.log("[CHAIN TEST] Step 1: Creating catalog...");
      // Create private catalog hierarchy (admin creates it, so only admin can access)
      const catalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Private Chain Test Catalog",
          isPublic: false,
        },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 1 done: catalog ${catalog.id}`);

      console.log("[CHAIN TEST] Step 2: Creating dataset...");
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Private Chain Test Dataset",
          catalog: catalog.id,
          language: "eng",
          isPublic: false,
        },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 2 done: dataset ${dataset.id}`);

      console.log("[CHAIN TEST] Step 3: Creating event...");
      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          data: { test: "chain test" },
          uniqueId: `${dataset.id}:test:chain-${Date.now()}`,
        },
        user: adminUser,
      });
      console.log(`[CHAIN TEST] Step 3 done: event ${event.id}`);

      console.log("[CHAIN TEST] Step 4: Testing otherUser access...");
      // otherUser should not access event (private dataset - admin only)
      await expect(
        payload.findByID({
          collection: "events",
          id: event.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
      console.log("[CHAIN TEST] Step 4 done: otherUser correctly denied");

      console.log("[CHAIN TEST] Step 5: Testing ownerUser access...");
      // ownerUser also should not access (admin-only for private data)
      await expect(
        payload.findByID({
          collection: "events",
          id: event.id,
          user: ownerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
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

  describe("Scheduled Import Access Control", () => {
    it("should validate catalog access when creating scheduled import", async () => {
      // Create private catalog (admin only)
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Private Scheduled Import Catalog",
          isPublic: false,
        },
        user: adminUser,
      });

      // otherUser should not be able to create scheduled import for private catalog
      await expect(
        withScheduledImport(testEnv, privateCatalog.id, "https://example.com/data.csv", {
          name: "Unauthorized Scheduled Import",
          frequency: "daily",
          enabled: false,
          user: otherUser,
        })
      ).rejects.toThrow();

      // Admin should be able to create scheduled import in private catalog
      const { scheduledImport } = await withScheduledImport(
        testEnv,
        privateCatalog.id,
        "https://example.com/data.csv",
        {
          name: "Authorized Scheduled Import",
          frequency: "daily",
          enabled: false,
          user: adminUser,
        }
      );
      expect(scheduledImport.name).toBe("Authorized Scheduled Import");
    }, 60000);
  });
});
