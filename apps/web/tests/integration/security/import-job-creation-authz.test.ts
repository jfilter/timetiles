// @vitest-environment node
/**
 * Security tests verifying import job creation validates ownership.
 *
 * The vulnerability: the create access rule only checks authentication and
 * a feature flag. Any authenticated user can create import-jobs referencing
 * another user's importFile or private dataset, immediately triggering
 * background pipeline work against resources they don't own.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import type { Catalog, Dataset, ImportFile, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Import Job Creation Authorization Vulnerability", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let ownerUser: User;
  let attackerUser: User;

  let ownerCatalog: Catalog;
  let ownerDataset: Dataset;
  let ownerImportFile: ImportFile;
  let attackerCatalog: Catalog;
  let attackerImportFile: ImportFile;

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
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create owner's catalog, dataset, and import file
    const catResult = await withCatalog(testEnv, {
      name: "Owner Private Catalog",
      isPublic: false,
      user: ownerUser,
    });
    ownerCatalog = catResult.catalog;

    const dsResult = await withDataset(testEnv, ownerCatalog.id, {
      name: "Owner Dataset",
      isPublic: false,
    });
    ownerDataset = dsResult.dataset;

    const csvContent = "name,location\nTest Event,Berlin";
    const ifResult = await withImportFile(testEnv, ownerCatalog.id, csvContent, {
      user: ownerUser.id,
      status: "processing",
    });
    ownerImportFile = ifResult.importFile;

    // Create attacker's own catalog and import file
    const attackerCatResult = await withCatalog(testEnv, {
      name: "Attacker Catalog",
      isPublic: false,
      user: attackerUser,
    });
    attackerCatalog = attackerCatResult.catalog;

    const attackerIfResult = await withImportFile(testEnv, attackerCatalog.id, csvContent, {
      user: attackerUser.id,
      status: "processing",
    });
    attackerImportFile = attackerIfResult.importFile;
  });

  describe("Vulnerability: arbitrary importFile/dataset references", () => {
    it("should reject when attacker creates job with another user's importFile", async () => {
      // Create attacker's own dataset to use as target
      const attackerDsResult = await withDataset(testEnv, attackerCatalog.id, {
        name: "Attacker Dataset",
        isPublic: false,
      });

      // Attacker tries to create an import job using owner's import file
      await expect(
        payload.create({
          collection: "import-jobs",
          data: {
            importFile: ownerImportFile.id,
            dataset: attackerDsResult.dataset.id,
            stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
          },
          user: attackerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should reject when attacker creates job targeting another user's private dataset", async () => {
      // Attacker tries to create an import job targeting owner's private dataset
      // using their own import file
      await expect(
        payload.create({
          collection: "import-jobs",
          data: {
            importFile: attackerImportFile.id,
            dataset: ownerDataset.id,
            stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
          },
          user: attackerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("Legitimate access after fix", () => {
    it("owner can create import job with their own importFile and dataset", async () => {
      const job = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: ownerImportFile.id,
          dataset: ownerDataset.id,
          stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(job.id).toBeDefined();
    });

    it("admin can create import job for any importFile/dataset", async () => {
      const job = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: ownerImportFile.id,
          dataset: ownerDataset.id,
          stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        },
        user: adminUser,
        overrideAccess: false,
      });
      expect(job.id).toBeDefined();
    });
  });
});
