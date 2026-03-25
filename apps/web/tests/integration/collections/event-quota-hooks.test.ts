// @vitest-environment node
/**
 * Integration tests for event beforeChange hooks:
 * - eventsBeforeChangeHook: sets denormalized access fields (datasetIsPublic, catalogOwnerId) on creation
 * - checkEventQuota: enforces TOTAL_EVENTS limit via checkAndIncrementUsage
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Event quota and denormalization hooks", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;

  let ownerUser: User;
  let adminUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { admin: { role: "admin" }, owner: { role: "user" } });
    adminUser = users.admin;
    ownerUser = users.owner;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  // Helper: create catalog bypassing quota
  const createCatalog = async (isPublic: boolean, createdBy: number) =>
    payload.create({
      collection: "catalogs",
      data: { name: `Cat ${Date.now()}-${Math.random()}`, isPublic, createdBy },
      overrideAccess: true,
    });

  // Helper: create dataset
  const createDataset = async (catalogId: number, isPublic: boolean) =>
    payload.create({
      collection: "datasets",
      data: { name: `DS ${Date.now()}-${Math.random()}`, catalog: catalogId, language: "eng", isPublic },
      overrideAccess: true,
    });

  describe("checkEventQuota", () => {
    it("enforces TOTAL_EVENTS quota via hook (checkAndIncrementUsage)", async () => {
      const { users } = await withUsers(testEnv, {
        quotaEditor: { role: "editor", customQuotas: { maxTotalEvents: 3 } },
      });
      const quotaEditor = users.quotaEditor;

      const catalog = await createCatalog(true, quotaEditor.id);
      const dataset = await createDataset(catalog.id, true);

      // Create events up to the limit — hook increments counter on each create
      for (let i = 0; i < 3; i++) {
        await payload.create({
          collection: "events",
          data: {
            dataset: dataset.id,
            sourceData: { i },
            transformedData: { i },
            uniqueId: `${dataset.id}:quota:${i}-${Date.now()}`,
          },
          user: quotaEditor,
        });
      }

      // Fourth event should be rejected
      await expect(
        payload.create({
          collection: "events",
          data: {
            dataset: dataset.id,
            sourceData: { i: 3 },
            transformedData: { i: 3 },
            uniqueId: `${dataset.id}:quota:3-${Date.now()}`,
          },
          user: quotaEditor,
        })
      ).rejects.toThrow(/Total events limit reached/);
    });

    it("allows event creation when under quota", async () => {
      const { users } = await withUsers(testEnv, {
        okEditor: { role: "editor", customQuotas: { maxTotalEvents: 100 } },
      });
      const okEditor = users.okEditor;

      const catalog = await createCatalog(true, okEditor.id);
      const dataset = await createDataset(catalog.id, true);

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "under-quota" },
          transformedData: { test: "under-quota" },
          uniqueId: `${dataset.id}:under-quota-${Date.now()}`,
        },
        user: okEditor,
      });
      expect(event.id).toBeDefined();
    });

    it("skips quota check for admin users", async () => {
      const catalog = await createCatalog(true, adminUser.id);
      const dataset = await createDataset(catalog.id, true);

      // Admin should always be able to create events — hook skips quota for admin role
      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { admin: true },
          transformedData: { admin: true },
          uniqueId: `${dataset.id}:admin:${Date.now()}`,
        },
        user: adminUser,
      });
      expect(event.id).toBeDefined();
    });

    it("skips quota check when no user context", async () => {
      const catalog = await createCatalog(true, ownerUser.id);
      const dataset = await createDataset(catalog.id, true);

      // System operations (no user) should bypass quota
      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { system: true },
          transformedData: { system: true },
          uniqueId: `${dataset.id}:system:${Date.now()}`,
        },
        overrideAccess: true,
      });
      expect(event.id).toBeDefined();
    });
  });

  describe("eventsBeforeChangeHook denormalization", () => {
    it("sets datasetIsPublic=true for event in public dataset + public catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);
      const dataset = await createDataset(catalog.id, true);

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "denorm" },
          transformedData: { test: "denorm" },
          uniqueId: `${dataset.id}:denorm:pub-${Date.now()}`,
        },
        overrideAccess: true,
      });

      expect(event.datasetIsPublic).toBe(true);
      expect(event.catalogOwnerId).toBe(ownerUser.id);
    });

    it("sets datasetIsPublic=false for event in private dataset", async () => {
      const catalog = await createCatalog(false, ownerUser.id);
      const dataset = await createDataset(catalog.id, false);

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "denorm" },
          transformedData: { test: "denorm" },
          uniqueId: `${dataset.id}:denorm:priv-${Date.now()}`,
        },
        overrideAccess: true,
      });

      expect(event.datasetIsPublic).toBe(false);
      expect(event.catalogOwnerId).toBe(ownerUser.id);
    });

    it("sets datasetIsPublic=false for event in public dataset + private catalog", async () => {
      const catalog = await createCatalog(false, ownerUser.id);
      const dataset = await createDataset(catalog.id, true);

      const event = await payload.create({
        collection: "events",
        data: {
          dataset: dataset.id,
          sourceData: { test: "denorm" },
          transformedData: { test: "denorm" },
          uniqueId: `${dataset.id}:denorm:mixed-${Date.now()}`,
        },
        overrideAccess: true,
      });

      // Public dataset in private catalog → combined is false
      expect(event.datasetIsPublic).toBe(false);
      expect(event.catalogOwnerId).toBe(ownerUser.id);
    });
  });
});
