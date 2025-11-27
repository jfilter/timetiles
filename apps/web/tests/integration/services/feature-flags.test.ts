/**
 * Integration tests for the Feature Flag service.
 *
 * Tests feature flag defaults, updates, access control, and caching behavior.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearFeatureFlagCache,
  getDefaultFeatureFlags,
  getFeatureFlags,
  isFeatureEnabled,
} from "@/lib/services/feature-flag-service";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("Feature Flag Service", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    // Reset all flags to enabled to avoid affecting other test files
    // that may run after this one in the same worker
    try {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: true,
            enableScheduledImports: true,
            enableRegistration: true,
            enableEventCreation: true,
            enableDatasetCreation: true,
            enableImportCreation: true,
            enableScheduledJobExecution: true,
            enableUrlFetchCaching: true,
          },
        },
      });
      clearFeatureFlagCache();
    } catch {
      // Ignore errors during cleanup
    }

    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    // Clear cache before each test to ensure fresh state
    clearFeatureFlagCache();
  });

  describe("Default Values", () => {
    it("should have all flags enabled by default", async () => {
      const flags = await getFeatureFlags(payload);

      expect(flags.allowPrivateImports).toBe(true);
      expect(flags.enableScheduledImports).toBe(true);
      expect(flags.enableRegistration).toBe(true);
      expect(flags.enableEventCreation).toBe(true);
      expect(flags.enableDatasetCreation).toBe(true);
      expect(flags.enableImportCreation).toBe(true);
      expect(flags.enableScheduledJobExecution).toBe(true);
      expect(flags.enableUrlFetchCaching).toBe(true);
    });

    it("should return defaults from getDefaultFeatureFlags()", () => {
      const defaults = getDefaultFeatureFlags();

      expect(defaults.allowPrivateImports).toBe(true);
      expect(defaults.enableScheduledImports).toBe(true);
      expect(defaults.enableRegistration).toBe(true);
      expect(defaults.enableEventCreation).toBe(true);
      expect(defaults.enableDatasetCreation).toBe(true);
      expect(defaults.enableImportCreation).toBe(true);
      expect(defaults.enableScheduledJobExecution).toBe(true);
      expect(defaults.enableUrlFetchCaching).toBe(true);
    });

    it("should match Settings global defaults", async () => {
      const settings = await payload.findGlobal({ slug: "settings" });

      // Verify the Settings global has the expected structure
      expect(settings.featureFlags).toBeDefined();

      // Default values should match service defaults
      // Note: Payload returns undefined for unset checkboxes, service should apply defaults
      const flags = await getFeatureFlags(payload);
      expect(flags.allowPrivateImports).toBe(true);
      expect(flags.enableScheduledImports).toBe(true);
      expect(flags.enableRegistration).toBe(true);
      expect(flags.enableEventCreation).toBe(true);
      expect(flags.enableDatasetCreation).toBe(true);
      expect(flags.enableImportCreation).toBe(true);
      expect(flags.enableScheduledJobExecution).toBe(true);
      expect(flags.enableUrlFetchCaching).toBe(true);
    });
  });

  describe("Update Operations", () => {
    beforeEach(async () => {
      // Reset flags to defaults before each test
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: true,
            enableScheduledImports: true,
            enableRegistration: true,
          },
        },
      });
      clearFeatureFlagCache();
    });

    it("should update allowPrivateImports flag", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.allowPrivateImports).toBe(false);
    });

    it("should update enableScheduledImports flag", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            enableScheduledImports: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.enableScheduledImports).toBe(false);
    });

    it("should update enableRegistration flag", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            enableRegistration: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.enableRegistration).toBe(false);
    });

    it("should update multiple flags at once", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: false,
            enableScheduledImports: false,
            enableRegistration: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.allowPrivateImports).toBe(false);
      expect(flags.enableScheduledImports).toBe(false);
      expect(flags.enableRegistration).toBe(false);
    });

    it("should update data creation flags", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            enableEventCreation: false,
            enableDatasetCreation: false,
            enableImportCreation: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.enableEventCreation).toBe(false);
      expect(flags.enableDatasetCreation).toBe(false);
      expect(flags.enableImportCreation).toBe(false);
    });

    it("should update job execution and caching flags", async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            enableScheduledJobExecution: false,
            enableUrlFetchCaching: false,
          },
        },
      });
      clearFeatureFlagCache();

      const flags = await getFeatureFlags(payload);
      expect(flags.enableScheduledJobExecution).toBe(false);
      expect(flags.enableUrlFetchCaching).toBe(false);
    });
  });

  describe("isFeatureEnabled Helper", () => {
    beforeEach(async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: true,
            enableScheduledImports: false,
            enableRegistration: true,
          },
        },
      });
      clearFeatureFlagCache();
    });

    it("should return true for enabled flags", async () => {
      expect(await isFeatureEnabled(payload, "allowPrivateImports")).toBe(true);
      expect(await isFeatureEnabled(payload, "enableRegistration")).toBe(true);
    });

    it("should return false for disabled flags", async () => {
      expect(await isFeatureEnabled(payload, "enableScheduledImports")).toBe(false);
    });
  });

  describe("Caching Behavior", () => {
    beforeEach(async () => {
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: true,
          },
        },
      });
      clearFeatureFlagCache();
    });

    it("should return cached values on subsequent calls", async () => {
      // First call loads from DB
      const flags1 = await getFeatureFlags(payload);
      expect(flags1.allowPrivateImports).toBe(true);

      // Update directly in DB without clearing cache
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: false,
          },
        },
      });

      // Second call should return cached (stale) value
      const flags2 = await getFeatureFlags(payload);
      expect(flags2.allowPrivateImports).toBe(true);
    });

    it("should return fresh data after cache is cleared", async () => {
      // First call loads from DB
      const flags1 = await getFeatureFlags(payload);
      expect(flags1.allowPrivateImports).toBe(true);

      // Update and clear cache
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: false,
          },
        },
      });
      clearFeatureFlagCache();

      // Should get fresh value
      const flags2 = await getFeatureFlags(payload);
      expect(flags2.allowPrivateImports).toBe(false);
    });
  });

  describe("Access Control", () => {
    it("should allow public read access to Settings global", async () => {
      const settings = await payload.findGlobal({
        slug: "settings",
        overrideAccess: false,
      });

      expect(settings).toBeDefined();
      expect(settings.featureFlags).toBeDefined();
    });

    it("should reject non-admin updates", async () => {
      const { users } = await withUsers(testEnv, {
        regularUser: { role: "user" },
      });

      await expect(
        payload.updateGlobal({
          slug: "settings",
          data: {
            featureFlags: {
              allowPrivateImports: false,
            },
          },
          user: users.regularUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should allow admin updates", async () => {
      const { users } = await withUsers(testEnv, {
        adminUser: { role: "admin" },
      });

      const updated = await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: false,
          },
        },
        user: users.adminUser,
        overrideAccess: false,
      });

      expect(updated.featureFlags?.allowPrivateImports).toBe(false);
    });
  });

  describe("Feature Flag Enforcement", () => {
    beforeEach(async () => {
      // Reset ALL flags to enabled (important: must include all flags to avoid stale state)
      await payload.updateGlobal({
        slug: "settings",
        data: {
          featureFlags: {
            allowPrivateImports: true,
            enableScheduledImports: true,
            enableRegistration: true,
            enableEventCreation: true,
            enableDatasetCreation: true,
            enableImportCreation: true,
            enableScheduledJobExecution: true,
            enableUrlFetchCaching: true,
          },
        },
      });
      clearFeatureFlagCache();
    });

    describe("allowPrivateImports", () => {
      it("should block private catalog creation when disabled", async () => {
        const { users } = await withUsers(testEnv, {
          regularUser: { role: "user" },
        });

        // Disable private imports
        await payload.updateGlobal({
          slug: "settings",
          data: { featureFlags: { allowPrivateImports: false } },
        });
        clearFeatureFlagCache();

        // Attempt to create a private catalog
        await expect(
          payload.create({
            collection: "catalogs",
            data: {
              name: "Private Catalog",
              isPublic: false,
            },
            user: users.regularUser,
            overrideAccess: false,
          })
        ).rejects.toThrow(/private.*disabled/i);
      });

      it("should allow public catalog creation when disabled", async () => {
        const { users } = await withUsers(testEnv, {
          regularUser: { role: "user" },
        });

        // Disable private imports
        await payload.updateGlobal({
          slug: "settings",
          data: { featureFlags: { allowPrivateImports: false } },
        });
        clearFeatureFlagCache();

        // Public catalogs should still work
        const catalog = await payload.create({
          collection: "catalogs",
          data: {
            name: "Public Catalog",
            isPublic: true,
          },
          user: users.regularUser,
          overrideAccess: false,
        });

        expect(catalog.id).toBeDefined();
        expect(catalog.isPublic).toBe(true);
      });

      it("should block private dataset creation when disabled", async () => {
        const { users } = await withUsers(testEnv, {
          regularUser: { role: "user" },
        });

        // Create a PUBLIC catalog owned by the user
        const catalog = await payload.create({
          collection: "catalogs",
          data: { name: "Test Catalog DS", isPublic: true },
          user: users.regularUser,
          overrideAccess: false,
        });

        // Disable private imports
        await payload.updateGlobal({
          slug: "settings",
          data: { featureFlags: { allowPrivateImports: false } },
        });
        clearFeatureFlagCache();

        // Attempt to create a private dataset in public catalog
        // Access control should pass (user can create in public catalogs)
        // But hook should throw because private datasets are disabled
        await expect(
          payload.create({
            collection: "datasets",
            data: {
              name: "Private Dataset",
              catalog: catalog.id,
              isPublic: false,
              language: "eng",
            },
            user: users.regularUser,
            overrideAccess: false,
          })
        ).rejects.toThrow(/disabled/i);
      });
    });

    describe("enableScheduledImports", () => {
      it("should block scheduled import creation when disabled", async () => {
        const { users } = await withUsers(testEnv, {
          regularUser: { role: "user" },
        });

        // Create required catalog and dataset (use overrideAccess to simplify setup)
        const catalog = await payload.create({
          collection: "catalogs",
          data: { name: "Test Catalog SI 1", isPublic: true, createdBy: users.regularUser.id },
          overrideAccess: true,
        });
        const dataset = await payload.create({
          collection: "datasets",
          data: { name: "Test Dataset SI 1", catalog: catalog.id, isPublic: true, language: "eng" },
          overrideAccess: true,
        });

        // Disable scheduled imports
        await payload.updateGlobal({
          slug: "settings",
          data: { featureFlags: { enableScheduledImports: false } },
        });
        clearFeatureFlagCache();

        // Attempt to create scheduled import - should fail access control
        await expect(
          payload.create({
            collection: "scheduled-imports",
            data: {
              name: "Test Schedule",
              sourceUrl: "https://example.com/data.csv",
              catalog: catalog.id,
              dataset: dataset.id,
              scheduleType: "frequency",
              frequency: "daily",
              enabled: false,
            },
            user: users.regularUser,
            overrideAccess: false,
          })
        ).rejects.toThrow();
      });

      it("should allow scheduled import creation when enabled", async () => {
        const { users } = await withUsers(testEnv, {
          regularUser: { role: "user" },
        });

        // Create required catalog and dataset (use overrideAccess to simplify setup)
        const catalog = await payload.create({
          collection: "catalogs",
          data: { name: "Test Catalog SI 2", isPublic: true, createdBy: users.regularUser.id },
          overrideAccess: true,
        });
        const dataset = await payload.create({
          collection: "datasets",
          data: { name: "Test Dataset SI 2", catalog: catalog.id, isPublic: true, language: "eng" },
          overrideAccess: true,
        });

        // Ensure scheduled imports are enabled
        await payload.updateGlobal({
          slug: "settings",
          data: { featureFlags: { enableScheduledImports: true } },
        });
        clearFeatureFlagCache();

        // Should succeed
        const schedule = await payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Test Schedule 2",
            sourceUrl: "https://example.com/data.csv",
            catalog: catalog.id,
            dataset: dataset.id,
            scheduleType: "frequency",
            frequency: "daily",
            enabled: false,
          },
          user: users.regularUser,
          overrideAccess: false,
        });

        expect(schedule.id).toBeDefined();
        expect(schedule.name).toBe("Test Schedule 2");
      });
    });
  });
});
