// @vitest-environment node
/**
 * Security tests verifying import job creation validates ownership.
 *
 * The vulnerability: the create access rule only checks authentication and
 * a feature flag. Any authenticated user can create import-jobs referencing
 * another user's ingestFile or private dataset, immediately triggering
 * background pipeline work against resources they don't own.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { Catalog, Dataset, IngestFile, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
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
  let ownerIngestFile: IngestFile;
  let attackerCatalog: Catalog;
  let attackerIngestFile: IngestFile;

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
    const catResult = await withCatalog(testEnv, { name: "Owner Private Catalog", isPublic: false, user: ownerUser });
    ownerCatalog = catResult.catalog;

    const dsResult = await withDataset(testEnv, ownerCatalog.id, { name: "Owner Dataset", isPublic: false });
    ownerDataset = dsResult.dataset;

    const csvContent = "name,location\nTest Event,Berlin";
    const ifResult = await withIngestFile(testEnv, ownerCatalog.id, csvContent, {
      user: ownerUser.id,
      status: "processing",
    });
    ownerIngestFile = ifResult.ingestFile;

    // Create attacker's own catalog and import file
    const attackerCatResult = await withCatalog(testEnv, {
      name: "Attacker Catalog",
      isPublic: false,
      user: attackerUser,
    });
    attackerCatalog = attackerCatResult.catalog;

    const attackerIfResult = await withIngestFile(testEnv, attackerCatalog.id, csvContent, {
      user: attackerUser.id,
      status: "processing",
    });
    attackerIngestFile = attackerIfResult.ingestFile;
  });

  describe("Vulnerability: arbitrary ingestFile/dataset references", () => {
    it("should reject when attacker creates job with another user's ingestFile", async () => {
      // Create attacker's own dataset to use as target
      const attackerDsResult = await withDataset(testEnv, attackerCatalog.id, {
        name: "Attacker Dataset",
        isPublic: false,
      });

      // Attacker tries to create an import job using owner's import file
      await expect(
        payload.create({
          collection: "ingest-jobs",
          data: {
            ingestFile: ownerIngestFile.id,
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
          collection: "ingest-jobs",
          data: {
            ingestFile: attackerIngestFile.id,
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
    it("owner can create import job with their own ingestFile and dataset", async () => {
      const job = await payload.create({
        collection: "ingest-jobs",
        data: { ingestFile: ownerIngestFile.id, dataset: ownerDataset.id, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(job.id).toBeDefined();
    });

    it("admin can create import job for any ingestFile/dataset", async () => {
      const job = await payload.create({
        collection: "ingest-jobs",
        data: { ingestFile: ownerIngestFile.id, dataset: ownerDataset.id, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES },
        user: adminUser,
        overrideAccess: false,
      });
      expect(job.id).toBeDefined();
    });
  });
});
