// @vitest-environment node
/**
 * Integration tests for dataset beforeChange hooks:
 * - validateDatasetVisibility: datasets in public catalogs must be public
 * - validateCreatePermission: users can only create datasets in their own catalogs
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

describe.sequential("Dataset validation hooks", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;

  let ownerUser: User;
  let otherUser: User;
  let adminUser: User;
  let editorUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      admin: { role: "admin" },
      editor: { role: "editor" },
      owner: { role: "user" },
      other: { role: "user" },
    });
    adminUser = users.admin;
    editorUser = users.editor;
    ownerUser = users.owner;
    otherUser = users.other;
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

  describe("validateDatasetVisibility", () => {
    it("rejects private dataset in a public catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      await expect(
        payload.create({
          collection: "datasets",
          data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: false },
          overrideAccess: true,
        })
      ).rejects.toThrow("Datasets in public catalogs must be public");
    });

    it("allows public dataset in a public catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        overrideAccess: true,
      });
      expect(dataset.isPublic).toBe(true);
    });

    it("allows private dataset in a private catalog", async () => {
      const catalog = await createCatalog(false, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: false },
        overrideAccess: true,
      });
      expect(dataset.isPublic).toBe(false);
    });

    it("allows public dataset in a private catalog", async () => {
      const catalog = await createCatalog(false, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        overrideAccess: true,
      });
      expect(dataset.isPublic).toBe(true);
    });

    it("rejects updating dataset to private in a public catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);
      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        overrideAccess: true,
      });

      await expect(
        payload.update({ collection: "datasets", id: dataset.id, data: { isPublic: false }, overrideAccess: true })
      ).rejects.toThrow("Datasets in public catalogs must be public");
    });
  });

  describe("validateCreatePermission", () => {
    it("rejects non-owner creating dataset in another user's catalog", async () => {
      const catalog = await createCatalog(false, ownerUser.id);

      await expect(
        payload.create({
          collection: "datasets",
          data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: false },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow("You can only create datasets in your own catalogs");
    });

    it("rejects non-owner creating dataset in another user's public catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      await expect(
        payload.create({
          collection: "datasets",
          data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow("You can only create datasets in your own catalogs");
    });

    it("allows catalog owner to create dataset", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(dataset.id).toBeDefined();
    });

    it("allows admin to create dataset in any catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        user: adminUser,
        overrideAccess: false,
      });
      expect(dataset.id).toBeDefined();
    });

    it("allows editor to create dataset in any catalog", async () => {
      const catalog = await createCatalog(true, ownerUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: catalog.id, language: "eng", isPublic: true },
        user: editorUser,
        overrideAccess: false,
      });
      expect(dataset.id).toBeDefined();
    });

    it("rejects moving dataset to another user's catalog on update", async () => {
      const ownerCatalog = await createCatalog(false, ownerUser.id);
      const otherCatalog = await createCatalog(false, otherUser.id);

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: `DS ${Date.now()}`, catalog: ownerCatalog.id, language: "eng", isPublic: false },
        user: ownerUser,
        overrideAccess: false,
      });

      await expect(
        payload.update({
          collection: "datasets",
          id: dataset.id,
          data: { catalog: otherCatalog.id },
          user: ownerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow("You can only create datasets in your own catalogs");
    });
  });
});
