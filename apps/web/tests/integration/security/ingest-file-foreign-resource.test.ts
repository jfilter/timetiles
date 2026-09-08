// @vitest-environment node
/**
 * Security tests verifying ingest-file creation validates catalog ownership.
 *
 * The vulnerability: any authenticated user could create an ingest-file
 * pointing to a foreign private catalog. The catalog ID is passed to
 * the dataset-detection job, which creates datasets in that catalog.
 * Additionally, metadata.datasetMapping could point to arbitrary dataset IDs
 * that the job would use without ownership checks.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { createLocalReq, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getIngestFilePath } from "@/lib/ingest/upload-path";
import type { Catalog, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Import File Foreign Resource Vulnerability", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let ownerUser: User;
  let attackerUser: User;

  let ownerPrivateCatalog: Catalog;
  let ownerPublicCatalog: Catalog;
  let attackerCatalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      adminUser: { role: "admin" },
      ownerUser: { role: "user", trustLevel: "5" },
      attackerUser: { role: "user" },
    });
    adminUser = users.adminUser;
    ownerUser = users.ownerUser;
    attackerUser = users.attackerUser;

    // Create catalogs
    const ownerPrivateResult = await withCatalog(testEnv, {
      name: "Owner Private Catalog",
      isPublic: false,
      user: ownerUser,
    });
    ownerPrivateCatalog = ownerPrivateResult.catalog;

    const ownerPublicResult = await withCatalog(testEnv, {
      name: "Owner Public Catalog",
      isPublic: true,
      user: ownerUser,
    });
    ownerPublicCatalog = ownerPublicResult.catalog;

    const attackerResult = await withCatalog(testEnv, {
      name: "Attacker Catalog",
      isPublic: false,
      user: attackerUser,
    });
    attackerCatalog = attackerResult.catalog;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  /** Helper to create a minimal CSV buffer */
  const csvBuffer = Buffer.from("name,location\nTest,Berlin");

  describe("Vulnerability: foreign catalog on ingest-file create", () => {
    it("should reject creating ingest-file with another user's private catalog", async () => {
      await expect(
        payload.create({
          collection: "ingest-files",
          data: { catalog: ownerPrivateCatalog.id },
          file: { data: csvBuffer, mimetype: "text/csv", name: `attack-${Date.now()}.csv`, size: csvBuffer.length },
          user: attackerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow(/own or public/i);
    });
  });

  describe("Legitimate access after fix", () => {
    it("checks ownership in the caller's transaction", async () => {
      const { ingestFile } = await withIngestFile(testEnv, ownerPrivateCatalog.id, "name\nOriginal\n", {
        user: ownerUser.id,
      });
      const req = await createLocalReq({ user: attackerUser }, payload);
      expect(await initTransaction(req)).toBe(true);
      try {
        // Internal ownership changes must be visible to access checks before commit.
        await payload.update({
          collection: "ingest-files",
          id: ingestFile.id,
          data: { user: attackerUser.id },
          overrideAccess: true,
          req,
        });
        const visible = await payload.findByID({
          collection: "ingest-files",
          id: ingestFile.id,
          overrideAccess: false,
          depth: 0,
          req,
        });
        expect(visible.user).toBe(attackerUser.id);
        await expect(
          payload.findByID({
            collection: "ingest-files",
            id: ingestFile.id,
            overrideAccess: false,
            req: { ...req, user: ownerUser },
          })
        ).rejects.toThrow(/not allowed|not found/i);
      } finally {
        await killTransaction(req);
      }
    });

    it("rejects owner-supplied storage metadata updates", async () => {
      const { ingestFile } = await withIngestFile(testEnv, ownerPrivateCatalog.id, "name\nOriginal\n", {
        user: ownerUser.id,
      });
      await expect(
        payload.update({
          collection: "ingest-files",
          id: ingestFile.id,
          data: { filename: "../unrelated.csv", filesize: 1, mimeType: "text/plain" },
          user: ownerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow(/not allowed/i);
      const updated = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
      expect(updated.filename).toBe(ingestFile.filename);
      expect(updated.filesize).toBe(ingestFile.filesize);
      expect(updated.mimeType).toBe(ingestFile.mimeType);
    });

    it.each(["owner", "admin"])("rejects source replacement by %s before touching the stored file", async (role) => {
      const original = "name\nOriginal source\n";
      const { ingestFile } = await withIngestFile(testEnv, ownerPrivateCatalog.id, original, { user: ownerUser.id });
      const replacement = Buffer.from("name\nReplacement source\n");
      await expect(
        payload.update({
          collection: "ingest-files",
          id: ingestFile.id,
          data: {},
          file: { data: replacement, mimetype: "text/csv", name: "replacement.csv", size: replacement.length },
          user: role === "owner" ? ownerUser : adminUser,
          overrideAccess: false,
        })
      ).rejects.toThrow(/not allowed/i);
      const after = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
      expect(after.filename).toBe(ingestFile.filename);
      expect(await readFile(getIngestFilePath(ingestFile.filename), "utf8")).toBe(original);
    });

    it("owner can create ingest-file with their own private catalog", async () => {
      const result = await payload.create({
        collection: "ingest-files",
        data: { catalog: ownerPrivateCatalog.id },
        file: { data: csvBuffer, mimetype: "text/csv", name: `owner-${Date.now()}.csv`, size: csvBuffer.length },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(result.id).toBeDefined();
    });

    it("attacker can create ingest-file with a public catalog", async () => {
      const result = await payload.create({
        collection: "ingest-files",
        data: { catalog: ownerPublicCatalog.id },
        file: { data: csvBuffer, mimetype: "text/csv", name: `public-${Date.now()}.csv`, size: csvBuffer.length },
        user: attackerUser,
        overrideAccess: false,
      });
      expect(result.id).toBeDefined();
    });

    it("admin can create ingest-file with any catalog", async () => {
      const result = await payload.create({
        collection: "ingest-files",
        data: { catalog: ownerPrivateCatalog.id },
        file: { data: csvBuffer, mimetype: "text/csv", name: `admin-${Date.now()}.csv`, size: csvBuffer.length },
        user: adminUser,
        overrideAccess: false,
      });
      expect(result.id).toBeDefined();
    });

    it("attacker can create ingest-file with their own catalog", async () => {
      const result = await payload.create({
        collection: "ingest-files",
        data: { catalog: attackerCatalog.id },
        file: { data: csvBuffer, mimetype: "text/csv", name: `attacker-own-${Date.now()}.csv`, size: csvBuffer.length },
        user: attackerUser,
        overrideAccess: false,
      });
      expect(result.id).toBeDefined();
    });
  });
});
