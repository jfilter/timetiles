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

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Catalog, User } from "@/payload-types";
import { createIntegrationTestEnvironment, withCatalog, withUsers } from "@/tests/setup/integration/environment";

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
      ownerUser: { role: "user" },
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
