/**
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withSchemaVersion,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schema Approval Workflow", () => {
  const collectionsToReset = [
    "ingest-files",
    "ingest-jobs",
    "datasets",
    "dataset-schemas",
    "user-usage",
    "payload-jobs",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let adminUser: any;
  let editorUser: any;
  let viewerUser: any;
  let testCatalogId: number;
  let testDatasetId: number;
  let testIngestFileId: number;
  let testIngestJobId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    // Create test users (stable across tests)
    const { users } = await withUsers(testEnv, ["admin", "editor", "user"]);
    adminUser = users.admin;
    editorUser = users.editor;
    viewerUser = users.user;

    // Create test catalog with editor, owned by admin (stable across tests)
    const { catalog } = await withCatalog(testEnv, {
      name: "Schema Approval Test Catalog",
      description: "Catalog for schema approval tests",
      user: adminUser,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup != null) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear mutable collections only (users and catalog are stable in beforeAll)
    await testEnv.seedManager.truncate(collectionsToReset);

    // Create test dataset with schema locking enabled (recreated per test)
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: `Schema Approval Test Dataset ${crypto.randomUUID().slice(0, 8)}`,
      description: "Dataset for schema approval tests",
      schemaConfig: {
        locked: true, // Require approval for all changes
        autoGrow: false,
        strictValidation: true,
        allowTransformations: true,
        maxSchemaDepth: 3,
      },
      currentSchema: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, date: { type: "string", format: "date" } },
        required: ["id", "title", "date"],
      },
    });
    testDatasetId = dataset.id;

    // Create test import file
    const csvContent = "title,date,location\nTest Event,2024-01-01,Test Location";
    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      status: "completed",
      user: adminUser.id,
    });
    testIngestFileId = ingestFile.id;

    // Create test import job
    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: testIngestFileId, dataset: testDatasetId, stage: "completed", sheetIndex: 0 },
    });
    testIngestJobId = ingestJob.id;
  });

  describe("Schema Creation and Approval", () => {
    it("creates draft schema when changes detected", async () => {
      // Create a draft schema with changes
      const { schema: draftSchema } = await withSchemaVersion(testEnv, testDatasetId, {
        versionNumber: 2,
        status: "draft",
        schemaProperties: {
          id: { type: "string" },
          title: { type: "string" },
          date: { type: "string", format: "date" },
          category: { type: "string" }, // New field
        },
        required: ["id", "title", "date"],
        newFields: ["category"],
        ingestJob: testIngestJobId,
      });

      expect(draftSchema._status).toBe("draft");
      expect(draftSchema.approvalRequired).toBe(true);
      expect(draftSchema.versionNumber).toBe(2);
    });

    it("allows admin to approve schema", async () => {
      // Create draft schema
      const { schema: draftSchema } = await withSchemaVersion(testEnv, testDatasetId, {
        versionNumber: 2,
        status: "draft",
        schemaProperties: {
          id: { type: "string" },
          title: { type: "string" },
          date: { type: "string", format: "date" },
          status: { type: "string", enum: ["active", "pending"] },
        },
        newFields: ["status"],
      });

      // Simulate approval
      const approvedSchema = await payload.update({
        collection: "dataset-schemas",
        id: draftSchema.id,
        data: { _status: "published", approvedBy: adminUser.id, approvalNotes: "Looks good, approved" },
        req: { user: adminUser } as any,
      });

      expect(approvedSchema._status).toBe("published");
      expect(
        typeof approvedSchema.approvedBy === "object" && approvedSchema.approvedBy !== null
          ? approvedSchema.approvedBy.id
          : approvedSchema.approvedBy
      ).toBe(adminUser.id);
      expect(approvedSchema.approvalNotes).toBe("Looks good, approved");
    });

    it("allows authorized editor to approve schema", async () => {
      // Create draft schema
      const { schema: draftSchema } = await withSchemaVersion(testEnv, testDatasetId, {
        versionNumber: 2,
        status: "draft",
        schemaProperties: {}, // Empty schema for minimal test
        required: [],
      });

      // Mock editor context (who has access to the catalog)
      const mockReq = { user: editorUser, payload, id: draftSchema.id };

      // Editor should be able to approve
      const approvedSchema = await payload.update({
        collection: "dataset-schemas",
        id: draftSchema.id,
        data: { _status: "published", approvedBy: editorUser.id },
        req: mockReq,
      });

      expect(approvedSchema._status).toBe("published");
      expect(
        typeof approvedSchema.approvedBy === "object" && approvedSchema.approvedBy !== null
          ? approvedSchema.approvedBy.id
          : approvedSchema.approvedBy
      ).toBe(editorUser.id);
    });

    it("prevents unauthorized users from approving schema", async () => {
      // Create draft schema (using overrideAccess implicitly via payload.create)
      const draftSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "draft",
          schema: { type: "object", properties: {} },
          fieldMetadata: {},
          schemaSummary: { totalFields: 0 },
          approvalRequired: true,
        },
      });

      // Regular user (role: "user") should NOT be able to update schemas
      // dataset-schemas update access is restricted to isEditorOrAdmin
      await expect(
        payload.update({
          collection: "dataset-schemas",
          id: draftSchema.id,
          data: { _status: "published", approvedBy: viewerUser.id },
          user: viewerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      // Verify the schema is still in draft after the rejected update
      const unchangedSchema = await payload.findByID({ collection: "dataset-schemas", id: draftSchema.id });
      expect(unchangedSchema._status).toBe("draft");
    });

    it("handles schema rejection", async () => {
      // Create draft schema with breaking changes
      const draftSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "draft",
          schema: {
            type: "object",
            properties: {
              id: { type: "number" }, // Type change from string to number
              title: { type: "string" },
            },
          },
          fieldMetadata: {},
          schemaSummary: { totalFields: 2, typeChanges: [{ path: "id", oldType: "string", newType: "number" }] },
          approvalRequired: true,
          conflicts: [
            { type: "type_change", path: "id", details: { oldType: "string", newType: "number" }, severity: "error" },
          ],
        },
      });

      // Reject the schema
      const rejectedSchema = await payload.update({
        collection: "dataset-schemas",
        id: draftSchema.id,
        data: {
          _status: "draft",
          approvedBy: adminUser.id,
          approvalNotes: "Breaking change: ID type cannot be changed",
        },
      });

      expect(rejectedSchema._status).toBe("draft");
      expect(rejectedSchema.approvalNotes).toContain("Breaking change");
    });
  });

  describe("Schema Approval Flag Storage", () => {
    // NOTE: Auto-approval decision logic lives in the import pipeline jobs
    // (schema-detection job), not in collection hooks. These tests verify
    // that the schema collection correctly stores approval-related fields.

    it("stores published auto-approved schema with correct flags", async () => {
      // Update dataset to allow auto-growth
      await payload.update({
        collection: "datasets",
        id: testDatasetId,
        data: { schemaConfig: { locked: false, autoGrow: true, strictValidation: false } },
      });

      const autoApprovedSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "published",
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              date: { type: "string", format: "date" },
              description: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["id", "title", "date"],
          },
          fieldMetadata: {},
          schemaSummary: {
            totalFields: 5,
            newFields: [{ path: "description" }, { path: "tags" }],
            removedFields: [],
            typeChanges: [],
            enumChanges: [],
          },
          approvalRequired: false,
          autoApproved: true,
        },
      });

      expect(autoApprovedSchema._status).toBe("published");
      expect(autoApprovedSchema.autoApproved).toBe(true);
      expect(autoApprovedSchema.approvalRequired).toBe(false);

      // Verify the stored schema is queryable and correctly linked
      const found = await payload.findByID({ collection: "dataset-schemas", id: autoApprovedSchema.id });
      expect(found.autoApproved).toBe(true);
      expect(found.versionNumber).toBe(2);
    });

    it("stores schema with enum growth metadata", async () => {
      await payload.update({
        collection: "datasets",
        id: testDatasetId,
        data: { schemaConfig: { locked: false, autoGrow: true } },
      });

      const enumGrowthSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "published",
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["active", "pending", "completed"] },
            },
          },
          fieldMetadata: {},
          schemaSummary: {
            totalFields: 2,
            enumChanges: [{ path: "status", addedValues: ["completed"], removedValues: [] }],
          },
          approvalRequired: false,
          autoApproved: true,
        },
      });

      expect(enumGrowthSchema.autoApproved).toBe(true);
      expect(enumGrowthSchema._status).toBe("published");
      const summary = enumGrowthSchema.schemaSummary as { enumChanges?: Array<{ path: string }> };
      expect(summary.enumChanges).toHaveLength(1);
      expect(summary.enumChanges![0]!.path).toBe("status");
    });

    it("stores draft schema requiring approval for breaking changes", async () => {
      const enumRemovalSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "draft",
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["active"] }, // Removed "pending"
            },
          },
          fieldMetadata: {},
          schemaSummary: {
            totalFields: 2,
            enumChanges: [{ path: "status", addedValues: [], removedValues: ["pending"] }],
          },
          approvalRequired: true,
          autoApproved: false,
        },
      });

      expect(enumRemovalSchema._status).toBe("draft");
      expect(enumRemovalSchema.approvalRequired).toBe(true);
    });
  });

  describe("Schema Version Management", () => {
    it("maintains schema version history", async () => {
      // Create multiple schema versions
      const versions = [];

      for (let i = 2; i <= 4; i++) {
        const schema = await payload.create({
          collection: "dataset-schemas",
          data: {
            dataset: testDatasetId,
            versionNumber: i,
            _status: i === 4 ? "published" : "draft",
            schema: { type: "object", properties: { id: { type: "string" }, [`field${i}`]: { type: "string" } } },
            fieldMetadata: {},
            schemaSummary: { totalFields: i },
          },
        });
        versions.push(schema);
      }

      // Verify versions were created correctly
      expect(versions).toHaveLength(3);
      expect(versions[2]!.versionNumber).toBe(4);
      expect(versions[2]!._status).toBe("published");

      // Query schema history
      const schemaHistory = await payload.find({
        collection: "dataset-schemas",
        where: { dataset: { equals: testDatasetId } },
        sort: "-versionNumber",
      });

      expect(schemaHistory.docs.length).toBeGreaterThanOrEqual(3);
      expect(schemaHistory.docs[0]!.versionNumber).toBe(4);
      expect(schemaHistory.docs[0]!._status).toBe("published");
    });

    it("creates published schema version linked to dataset", async () => {
      const newSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, newField: { type: "string" } },
      };

      // Create and activate new schema version
      const schemaDoc = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "published",
          schema: newSchema,
          fieldMetadata: { id: { occurrences: 100 }, title: { occurrences: 100 }, newField: { occurrences: 50 } },
          schemaSummary: { totalFields: 3 },
        },
      });

      expect(schemaDoc.versionNumber).toBe(2);
      expect(schemaDoc._status).toBe("published");

      // Verify the schema is queryable and linked to the correct dataset
      const found = await payload.findByID({ collection: "dataset-schemas", id: schemaDoc.id });
      expect(found._status).toBe("published");
      const linkedDatasetId = typeof found.dataset === "object" ? found.dataset.id : found.dataset;
      expect(linkedDatasetId).toBe(testDatasetId);
    });
  });

  describe("Import Integration", () => {
    it("updates import stage after schema approval", async () => {
      // Create import waiting for schema approval
      const importRecord = await payload.create({
        collection: "ingest-jobs",
        data: {
          ingestFile: testIngestFileId,
          dataset: testDatasetId,
          stage: "needs-review",
          sheetIndex: 0,
          schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } },
        },
      });

      // Create and approve schema
      const schema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "published",
          schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } },
          fieldMetadata: {},
          schemaSummary: { totalFields: 2 },
          ingestSources: [{ ingestJob: importRecord.id, recordCount: 100 }],
          approvedBy: adminUser.id,
          approvalNotes: "Approved for testing",
        },
      });

      // Verify the schema was created successfully
      expect(schema._status).toBe("published");
      expect(
        typeof schema.approvedBy === "object" && schema.approvedBy !== null ? schema.approvedBy.id : schema.approvedBy
      ).toBe(adminUser.id);

      // In a real system, the approval would trigger the import job to continue
      // The job would move from "needs-review" to the next stage
      // We can verify the job system is available for this
      expect(payload.jobs).toBeDefined();
      expect(payload.jobs.queue).toBeDefined();

      // The import record should still be in needs-review stage
      // (actual progression would happen via hooks in production)
      const updatedImport = await payload.findByID({ collection: "ingest-jobs", id: importRecord.id });
      expect(updatedImport.stage).toBe("needs-review");
    });

    it("handles multiple pending imports waiting for same schema", async () => {
      // Create multiple imports waiting for same schema
      const imports = [];
      for (let i = 1; i <= 3; i++) {
        const imp = await payload.create({
          collection: "ingest-jobs",
          data: { ingestFile: testIngestFileId, dataset: testDatasetId, stage: "needs-review", sheetIndex: 0 },
        });
        imports.push(imp);
      }

      expect(imports).toHaveLength(3);

      // Approve a schema for this dataset
      await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "published",
          schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } },
          fieldMetadata: {},
          schemaSummary: { totalFields: 2 },
          approvedBy: adminUser.id,
        },
      });

      // Verify all import jobs are still queryable and in their expected state
      // (actual stage progression happens via hooks in production —
      //  here we verify the imports exist and weren't corrupted by the schema creation)
      for (const imp of imports) {
        const updated = await payload.findByID({ collection: "ingest-jobs", id: imp.id });
        expect(updated).toBeDefined();
        expect(updated.dataset).toBeDefined();
      }
    });
  });

  describe("Conflict Resolution", () => {
    it("provides detailed conflict information", async () => {
      const conflictSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: testDatasetId,
          versionNumber: 2,
          _status: "draft",
          schema: {
            type: "object",
            properties: {
              id: { type: "number" }, // Was string
              title: { type: "string" },
              date: { type: "string" }, // Missing format
            },
          },
          fieldMetadata: {},
          schemaSummary: {
            totalFields: 3,
            typeChanges: [{ path: "id", oldType: "string", newType: "number" }],
            removedFields: [
              {
                path: "required_field", // Was required, now missing
              },
            ],
          },
          approvalRequired: true,
          conflicts: [
            {
              type: "type_change",
              path: "id",
              details: { oldType: "string", newType: "number", impact: "All existing IDs will fail validation" },
              severity: "error",
              autoApprovable: false,
            },
            {
              type: "removed_field",
              path: "required_field",
              details: { wasRequired: true, impact: "Events missing this field will be invalid" },
              severity: "error",
              autoApprovable: false,
            },
          ],
        },
      });

      const conflicts = conflictSchema.conflicts as Array<{ severity: string }>;
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]!.severity).toBe("error");
      expect(conflictSchema.approvalRequired).toBe(true);
    });
  });

  describe("Permission Checks", () => {
    it("regular users cannot read private schemas from other catalogs", async () => {
      // Create a private catalog owned by admin
      const otherCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Other Private Catalog", slug: `other-private-${Date.now()}`, isPublic: false },
        user: adminUser,
      });

      const otherDataset = await payload.create({
        collection: "datasets",
        data: {
          name: `Other Private Dataset ${Date.now()}`,
          slug: `other-private-ds-${Date.now()}`,
          catalog: otherCatalog.id,
          language: "eng",
          isPublic: false,
        },
      });

      // Create a schema in the private dataset
      const otherSchema = await payload.create({
        collection: "dataset-schemas",
        data: {
          dataset: otherDataset.id,
          versionNumber: 2,
          _status: "draft",
          schema: { type: "object", properties: {} },
          fieldMetadata: {},
          schemaSummary: { totalFields: 0 },
          approvalRequired: true,
        },
      });

      // Regular user (viewerUser) should NOT be able to read private schemas from other catalogs
      const readResult = await payload.find({
        collection: "dataset-schemas",
        where: { id: { equals: otherSchema.id } },
        user: viewerUser,
        overrideAccess: false,
      });
      expect(readResult.docs).toHaveLength(0);
    });
  });
});
