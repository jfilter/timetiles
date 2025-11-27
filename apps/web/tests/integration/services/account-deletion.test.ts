// @vitest-environment node
/**
 * Integration tests for account deletion service.
 *
 * Tests the complete account deletion lifecycle including:
 * - System user creation
 * - Deletion validation checks
 * - Scheduling with grace period
 * - Cancellation
 * - Execution with data transfer/deletion
 * - Audit logging
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AccountDeletionService } from "@/lib/services/account-deletion-service";
import {
  DELETION_GRACE_PERIOD_DAYS,
  getAccountDeletionService,
  resetAccountDeletionService,
} from "@/lib/services/account-deletion-service";
import { getSystemUserService, resetSystemUserService, SYSTEM_USER_EMAIL } from "@/lib/services/system-user-service";
import type { User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Account Deletion Service", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let truncate: () => Promise<void>;
  let deletionService: AccountDeletionService;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    truncate = env.seedManager.truncate.bind(env.seedManager);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await truncate();
    resetAccountDeletionService();
    resetSystemUserService();
    deletionService = getAccountDeletionService(payload);
  });

  describe("System User Service", () => {
    it("should create system user on first call", async () => {
      const systemUserService = getSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      expect(systemUser).toBeDefined();
      expect(systemUser.email).toBe(SYSTEM_USER_EMAIL);
      expect(systemUser.isActive).toBe(false);
      expect(systemUser.role).toBe("user");
    });

    it("should return same system user on subsequent calls", async () => {
      const systemUserService = getSystemUserService(payload);
      const first = await systemUserService.getOrCreateSystemUser();
      const second = await systemUserService.getOrCreateSystemUser();

      expect(first.id).toBe(second.id);
    });

    it("should identify system user correctly", async () => {
      const systemUserService = getSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      const isSystem = await systemUserService.isSystemUser(systemUser.id);
      expect(isSystem).toBe(true);

      // Create a regular user
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { regular: { role: "user" } });

      const isRegularSystem = await systemUserService.isSystemUser(users.regular.id);
      expect(isRegularSystem).toBe(false);
    });
  });

  describe("canDeleteUser", () => {
    it("should allow deleting a regular user", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const result = await deletionService.canDeleteUser(users.testUser.id);
      expect(result.allowed).toBe(true);
    });

    it("should prevent deleting system user", async () => {
      const systemUserService = getSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      const result = await deletionService.canDeleteUser(systemUser.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("System user");
    });

    it("should prevent deleting the last admin", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { admin: { role: "admin" } });

      const result = await deletionService.canDeleteUser(users.admin.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("last admin");
    });

    it("should allow deleting admin if another admin exists", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, {
        admin1: { role: "admin" },
        admin2: { role: "admin", email: "admin2@test.com" },
      });

      const result = await deletionService.canDeleteUser(users.admin1.id);
      expect(result.allowed).toBe(true);
    });

    it("should return not found for non-existent user", async () => {
      const result = await deletionService.canDeleteUser(99999);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  describe("getDeletionSummary", () => {
    it("should count user data correctly", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create public catalog and dataset
      const publicCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Public Catalog", isPublic: true },
        user: users.testUser,
      });

      await payload.create({
        collection: "datasets",
        data: { name: "Public Dataset", catalog: publicCatalog.id, isPublic: true, language: "eng" },
        user: users.testUser,
      });

      // Create private catalog and dataset
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog", isPublic: false },
        user: users.testUser,
      });

      await payload.create({
        collection: "datasets",
        data: { name: "Private Dataset", catalog: privateCatalog.id, isPublic: false, language: "eng" },
        user: users.testUser,
      });

      const summary = await deletionService.getDeletionSummary(users.testUser.id);

      expect(summary.catalogs.public).toBe(1);
      expect(summary.catalogs.private).toBe(1);
      expect(summary.datasets.public).toBe(1);
      expect(summary.datasets.private).toBe(1);
    });
  });

  describe("scheduleDeletion", () => {
    it("should schedule deletion with 7-day grace period", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const result = await deletionService.scheduleDeletion(users.testUser.id);

      expect(result.success).toBe(true);
      expect(result.deletionScheduledAt).toBeDefined();

      // Verify user status updated
      const updatedUser = await payload.findByID({
        collection: "users",
        id: users.testUser.id,
        overrideAccess: true,
      });

      expect(updatedUser.deletionStatus).toBe("pending_deletion");
      expect(updatedUser.deletionScheduledAt).toBe(result.deletionScheduledAt);

      // Verify grace period is approximately 7 days
      const scheduledDate = new Date(result.deletionScheduledAt);
      const now = new Date();
      const daysDiff = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(DELETION_GRACE_PERIOD_DAYS - 0.1);
      expect(daysDiff).toBeLessThan(DELETION_GRACE_PERIOD_DAYS + 0.1);
    });

    it("should throw if user cannot be deleted", async () => {
      const systemUserService = getSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      await expect(deletionService.scheduleDeletion(systemUser.id)).rejects.toThrow();
    });
  });

  describe("cancelDeletion", () => {
    it("should cancel a pending deletion", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Schedule deletion first
      await deletionService.scheduleDeletion(users.testUser.id);

      // Cancel it
      await deletionService.cancelDeletion(users.testUser.id);

      // Verify user status
      const updatedUser = await payload.findByID({
        collection: "users",
        id: users.testUser.id,
        overrideAccess: true,
      });

      expect(updatedUser.deletionStatus).toBe("active");
      expect(updatedUser.deletionScheduledAt).toBeNull();
    });

    it("should throw if no pending deletion", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      await expect(deletionService.cancelDeletion(users.testUser.id)).rejects.toThrow("No pending deletion");
    });
  });

  describe("executeDeletion", () => {
    it("should transfer public data to system user", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create public catalog
      const publicCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Public Catalog", isPublic: true },
        user: users.testUser,
      });

      // Create public dataset
      const publicDataset = await payload.create({
        collection: "datasets",
        data: { name: "Public Dataset", catalog: publicCatalog.id, isPublic: true, language: "eng" },
        user: users.testUser,
      });

      // Execute deletion
      const result = await deletionService.executeDeletion(users.testUser.id);

      expect(result.success).toBe(true);
      expect(result.dataTransferred.catalogs).toBe(1);
      expect(result.dataTransferred.datasets).toBe(1);

      // Verify catalog transferred to system user
      const updatedCatalog = await payload.findByID({
        collection: "catalogs",
        id: publicCatalog.id,
        overrideAccess: true,
      });
      // createdBy may be populated as an object or just an ID
      const catalogCreatedBy =
        typeof updatedCatalog.createdBy === "object" ? updatedCatalog.createdBy.id : updatedCatalog.createdBy;
      expect(catalogCreatedBy).toBe(result.transferredToUserId);

      // Verify dataset transferred
      const updatedDataset = await payload.findByID({
        collection: "datasets",
        id: publicDataset.id,
        overrideAccess: true,
      });
      // createdBy may be populated as an object or just an ID
      const datasetCreatedBy =
        typeof updatedDataset.createdBy === "object" ? updatedDataset.createdBy.id : updatedDataset.createdBy;
      expect(datasetCreatedBy).toBe(result.transferredToUserId);
    });

    it("should delete private data", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create private catalog
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog", isPublic: false },
        user: users.testUser,
      });

      // Create private dataset
      const privateDataset = await payload.create({
        collection: "datasets",
        data: { name: "Private Dataset", catalog: privateCatalog.id, isPublic: false, language: "eng" },
        user: users.testUser,
      });

      // Execute deletion
      const result = await deletionService.executeDeletion(users.testUser.id);

      expect(result.success).toBe(true);
      expect(result.dataDeleted.catalogs).toBe(1);
      expect(result.dataDeleted.datasets).toBe(1);

      // Verify private data is deleted (Payload throws NotFound for deleted records)
      let deletedCatalog = null;
      try {
        deletedCatalog = await payload.findByID({
          collection: "catalogs",
          id: privateCatalog.id,
          overrideAccess: true,
        });
      } catch {
        // Expected - record was deleted
      }
      expect(deletedCatalog).toBeNull();

      let deletedDataset = null;
      try {
        deletedDataset = await payload.findByID({
          collection: "datasets",
          id: privateDataset.id,
          overrideAccess: true,
        });
      } catch {
        // Expected - record was deleted
      }
      expect(deletedDataset).toBeNull();
    });

    it("should anonymize user and mark as deleted", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const originalEmail = users.testUser.email;

      await deletionService.executeDeletion(users.testUser.id);

      const deletedUser = await payload.findByID({
        collection: "users",
        id: users.testUser.id,
        overrideAccess: true,
      });

      expect(deletedUser.deletionStatus).toBe("deleted");
      expect(deletedUser.email).not.toBe(originalEmail);
      expect(deletedUser.email).toContain("deleted");
      expect(deletedUser.isActive).toBe(false);
    });

    it("should create audit log entry", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      await deletionService.executeDeletion(users.testUser.id);

      const auditLogs = await payload.find({
        collection: "deletion-audit-log",
        where: { deletedUserId: { equals: users.testUser.id } },
        overrideAccess: true,
      });

      expect(auditLogs.docs.length).toBe(1);
      expect(auditLogs.docs[0].deletedUserId).toBe(users.testUser.id);
      expect(auditLogs.docs[0].deletedUserEmailHash).toBeDefined();
      expect(auditLogs.docs[0].deletionType).toBe("scheduled");
    });
  });

  describe("findDueDeletions", () => {
    it("should find users with past due deletion dates", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Set deletion to past date
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await payload.update({
        collection: "users",
        id: users.testUser.id,
        data: {
          deletionStatus: "pending_deletion",
          deletionScheduledAt: pastDate,
        },
        overrideAccess: true,
      });

      const dueDeletions = await deletionService.findDueDeletions();

      expect(dueDeletions.length).toBeGreaterThanOrEqual(1);
      expect(dueDeletions.some((u: User) => u.id === users.testUser.id)).toBe(true);
    });

    it("should not find users with future deletion dates", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Set deletion to future date
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await payload.update({
        collection: "users",
        id: users.testUser.id,
        data: {
          deletionStatus: "pending_deletion",
          deletionScheduledAt: futureDate,
        },
        overrideAccess: true,
      });

      const dueDeletions = await deletionService.findDueDeletions();

      expect(dueDeletions.some((u: User) => u.id === users.testUser.id)).toBe(false);
    });
  });
});
