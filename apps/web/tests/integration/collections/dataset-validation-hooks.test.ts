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

  describe("external ID and mapping transform validation", () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const createDataset = async (extra: Record<string, any>) => {
      const catalog = await createCatalog(true, ownerUser.id);
      return payload.create({
        collection: "datasets",
        data: {
          name: `DS ${Date.now()}-${Math.random()}`,
          catalog: catalog.id,
          language: "eng",
          isPublic: true,
          ...extra,
        },
        overrideAccess: true,
      });
    };

    const rename = (from: string, to: string) => ({
      id: crypto.randomUUID(),
      type: "rename" as const,
      from,
      to,
      active: true,
    });

    it("rejects an external strategy with no externalIdPath", async () => {
      await expect(createDataset({ idStrategy: { type: "external", duplicateStrategy: "skip" } })).rejects.toThrow(
        /requires an External ID Path/
      );
    });

    it("rejects a transform that moves the external-ID field away (create)", async () => {
      await expect(
        createDataset({
          idStrategy: { type: "external", externalIdPath: "ref", duplicateStrategy: "skip" },
          ingestTransforms: [rename("ref", "archived")],
        })
      ).rejects.toThrow(/moves the external ID field "ref" to "archived"/);
    });

    it("allows a valid external config and a transform that PRODUCES the ID path", async () => {
      const dataset = await createDataset({
        idStrategy: { type: "external", externalIdPath: "ref", duplicateStrategy: "skip" },
        ingestTransforms: [rename("raw_id", "ref")],
      });
      expect(dataset.id).toBeDefined();
    });

    it("rejects adding a move-away transform via a partial update (idStrategy untouched)", async () => {
      const dataset = await createDataset({
        idStrategy: { type: "external", externalIdPath: "ref", duplicateStrategy: "skip" },
      });

      // The patch carries only ingestTransforms; idStrategy lives in originalDoc.
      await expect(
        payload.update({
          collection: "datasets",
          id: dataset.id,
          data: { ingestTransforms: [rename("ref", "archived")] },
          overrideAccess: true,
        })
      ).rejects.toThrow(/moves the external ID field "ref" to "archived"/);
    });

    it("rejects when a partial update repoints externalIdPath onto an existing move-away transform", async () => {
      const dataset = await createDataset({
        idStrategy: { type: "external", externalIdPath: "ref", duplicateStrategy: "skip" },
        ingestTransforms: [rename("location", "archived_location")],
      });

      // Patch carries only idStrategy; transforms live in originalDoc. The
      // existing rename now moves the new ID path away.
      await expect(
        payload.update({
          collection: "datasets",
          id: dataset.id,
          data: { idStrategy: { type: "external", externalIdPath: "location", duplicateStrategy: "skip" } },
          overrideAccess: true,
        })
      ).rejects.toThrow(/moves the external ID field "location" to "archived_location"/);
    });

    it("rejects a transform that moves away a geo/time mapping override field", async () => {
      await expect(
        createDataset({
          idStrategy: { type: "content-hash", duplicateStrategy: "skip" },
          fieldMappingOverrides: { timestampPath: "event_date" },
          ingestTransforms: [rename("event_date", "date")],
        })
      ).rejects.toThrow(/the timestamp mapping points at "event_date"/);
    });

    it("allows a mapping override whose field is produced (not deleted) by a transform", async () => {
      const dataset = await createDataset({
        idStrategy: { type: "content-hash", duplicateStrategy: "skip" },
        fieldMappingOverrides: { timestampPath: "date" },
        ingestTransforms: [rename("event_date", "date")],
      });
      expect(dataset.id).toBeDefined();
    });
  });
});
