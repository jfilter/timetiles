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

import { sql } from "@payloadcms/db-postgres";
import type { CollectionAfterChangeHook } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountDeletionService } from "@/lib/account/deletion-service";
import { createAccountDeletionService } from "@/lib/account/deletion-service";
import { createSystemUserService, SYSTEM_USER_EMAIL } from "@/lib/account/system-user";
import { getAppConfig } from "@/lib/config/app-config";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { extractRelationId } from "@/lib/utils/relation-id";
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
    truncate = () => env.seedManager.truncate(["users", "catalogs", "datasets", "audit-log"]);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await truncate();
    deletionService = createAccountDeletionService(payload);
  });

  describe("System User Service", () => {
    it("should create system user on first call", async () => {
      const systemUserService = createSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      expect(systemUser).toBeDefined();
      expect(systemUser.email).toBe(SYSTEM_USER_EMAIL);
      expect(systemUser.isActive).toBe(false);
      expect(systemUser.role).toBe("user");
    });

    it("should return same system user on subsequent calls", async () => {
      const systemUserService = createSystemUserService(payload);
      const first = await systemUserService.getOrCreateSystemUser();
      const second = await systemUserService.getOrCreateSystemUser();

      expect(first.id).toBe(second.id);
    });

    it("should share the same system user across concurrent creators", async () => {
      const [first, second] = await Promise.all([
        createSystemUserService(payload).getOrCreateSystemUser(),
        createSystemUserService(payload).getOrCreateSystemUser(),
      ]);
      expect(first.id).toBe(second.id);
      expect(first.email).toBe(SYSTEM_USER_EMAIL);
    });
  });

  describe("canDeleteUser", () => {
    it("should propagate database failures instead of reporting a missing user", async () => {
      const req = await createLocalReq({}, payload);
      await initTransaction(req);
      try {
        const db = await getTransactionAwareDrizzle(payload, req);
        await expect(db.execute(sql`SELECT 1 / 0`)).rejects.toThrow();
        await expect(deletionService.canDeleteUser(99999, req)).rejects.toThrow();
      } finally {
        await killTransaction(req);
      }
    });

    it("should allow deleting a regular user", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const result = await deletionService.canDeleteUser(users.testUser.id);
      expect(result.allowed).toBe(true);
    });

    it("should prevent deleting system user", async () => {
      const systemUserService = createSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      const result = await deletionService.canDeleteUser(systemUser.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("System user");
      expect(result.reasonCode).toBe("systemUser");
    });

    it("should prevent deleting the last admin", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { admin: { role: "admin" } });

      // In shared test environments (isolate: false), other admin users may exist
      // from other test files. Demote all other admins to ensure ours is truly the last.
      const allAdmins = await payload.find({
        collection: "users",
        where: { and: [{ role: { equals: "admin" } }, { id: { not_equals: users.admin.id } }] },
        overrideAccess: true,
      });
      for (const admin of allAdmins.docs) {
        await payload.update({ collection: "users", id: admin.id, data: { role: "user" }, overrideAccess: true });
      }

      const result = await deletionService.canDeleteUser(users.admin.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("last admin");
      expect(result.reasonCode).toBe("lastAdmin");

      // Restore demoted admins
      for (const admin of allAdmins.docs) {
        await payload.update({ collection: "users", id: admin.id, data: { role: "admin" }, overrideAccess: true });
      }
    });

    it("should allow deleting admin if another admin exists", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { admin1: { role: "admin" }, admin2: { role: "admin" } });

      const result = await deletionService.canDeleteUser(users.admin1.id);
      expect(result.allowed).toBe(true);
    });

    it("should return not found for non-existent user", async () => {
      const result = await deletionService.canDeleteUser(99999);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
      expect(result.reasonCode).toBe("userNotFound");
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
    it.each(["schedule", "execute"])(
      "should retain an active admin when both admins %s deletion concurrently",
      async (action) => {
        const env = { payload, seedManager: { truncate } } as any;
        const { users } = await withUsers(env, { adminA: { role: "admin" }, adminB: { role: "admin" } });
        await createSystemUserService(payload).getOrCreateSystemUser();
        const remove = (id: number) =>
          action === "schedule"
            ? deletionService.scheduleDeletion(id)
            : deletionService.executeDeletion(id, { deletionType: "self" });
        const results = await Promise.allSettled([remove(users.adminA.id), remove(users.adminB.id)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.find((result) => result.status === "rejected")).toMatchObject({
          reason: { message: expect.stringContaining("Cannot delete the last admin user") },
        });
        const remaining = await payload.count({
          collection: "users",
          where: {
            and: [
              { id: { in: [users.adminA.id, users.adminB.id] } },
              { role: { equals: "admin" } },
              { deletionStatus: { equals: "active" } },
            ],
          },
          overrideAccess: true,
        });
        expect(remaining.totalDocs).toBe(1);
      }
    );

    it("should accept only one concurrent deletion request", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });
      const results = await Promise.allSettled([
        deletionService.scheduleDeletion(users.testUser.id),
        deletionService.scheduleDeletion(users.testUser.id),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({
        reason: { statusCode: 400, message: "Deletion already scheduled" },
      });
      const successful = results.find((result) => result.status === "fulfilled")!;
      const user = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });
      expect(user.deletionScheduledAt).toBe(successful.value.deletionScheduledAt);
    });

    it("should schedule deletion with grace period", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const result = await deletionService.scheduleDeletion(users.testUser.id);

      expect(result.success).toBe(true);
      expect(result.deletionScheduledAt).toBeDefined();

      // Verify user status updated
      const updatedUser = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });

      expect(updatedUser.deletionStatus).toBe("pending_deletion");
      expect(updatedUser.deletionScheduledAt).toBe(result.deletionScheduledAt);

      const gracePeriodDays = getAppConfig().account.deletionGracePeriodDays;
      expect(result.gracePeriodDays).toBe(gracePeriodDays);
      const scheduledDate = new Date(result.deletionScheduledAt);
      const now = new Date();
      const daysDiff = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(gracePeriodDays - 0.1);
      expect(daysDiff).toBeLessThan(gracePeriodDays + 0.1);
    });

    it("should throw if user cannot be deleted", async () => {
      const systemUserService = createSystemUserService(payload);
      const systemUser = await systemUserService.getOrCreateSystemUser();

      await expect(deletionService.scheduleDeletion(systemUser.id)).rejects.toMatchObject({ statusCode: 400 });
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
      const updatedUser = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });

      expect(updatedUser.deletionStatus).toBe("active");
      expect(updatedUser.deletionScheduledAt).toBeNull();
    });

    it("should throw if no pending deletion", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      await expect(deletionService.cancelDeletion(users.testUser.id)).rejects.toMatchObject({
        statusCode: 400,
        message: "No pending deletion to cancel",
      });
    });
  });

  describe("executeDeletion", () => {
    it("should execute a due scheduled deletion", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });
      await payload.update({
        collection: "users",
        id: users.testUser.id,
        data: { deletionStatus: "pending_deletion", deletionScheduledAt: new Date(0).toISOString() },
        overrideAccess: true,
      });
      expect((await deletionService.executeDeletion(users.testUser.id)).success).toBe(true);
      const user = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });
      expect(user.deletionStatus).toBe("deleted");
    });

    it.each(["execute", "cancel", "schedule"])("should recheck the user after waiting to %s", async (action) => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });
      const userId = users.testUser.id;
      await payload.update({
        collection: "users",
        id: userId,
        data: { deletionStatus: "pending_deletion", deletionScheduledAt: new Date(0).toISOString() },
        overrideAccess: true,
      });
      const req = await createLocalReq({}, payload);
      await initTransaction(req);
      const db = await getTransactionAwareDrizzle(payload, req);
      await db.execute(sql`SELECT id FROM payload.users WHERE id = ${userId} FOR UPDATE`);
      const { rows: owners } = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
      const operations = {
        execute: () => deletionService.executeDeletion(userId),
        cancel: () => deletionService.cancelDeletion(userId),
        schedule: () => deletionService.scheduleDeletion(userId),
      };
      const operation = operations[action as keyof typeof operations]();
      const outcome = (async () => {
        try {
          await operation;
          return null;
        } catch (error) {
          return error;
        }
      })();
      const status = action === "execute" ? "active" : "deleted";
      try {
        await vi.waitFor(
          async () => {
            const { rows } = await payload.db.drizzle.execute(sql`SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity WHERE ${owners[0].pid} = ANY(pg_blocking_pids(pid))
          ) AS blocked`);
            expect(rows[0]?.blocked).toBe(true);
          },
          { timeout: 5000, interval: 20 }
        );
        await db.execute(sql`UPDATE payload.users SET deletion_status = ${status} WHERE id = ${userId}`);
        await commitTransaction(req);
        expect(await outcome).toBeInstanceOf(Error);
        const user = await payload.findByID({ collection: "users", id: userId, overrideAccess: true });
        expect(user.deletionStatus).toBe(status);
        expect(user.email).toBe(users.testUser.email);
      } finally {
        await killTransaction(req);
        await outcome;
      }
    });

    it.each(["cancelled", "future"])("should reject a %s scheduled deletion", async (state) => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });
      await deletionService.scheduleDeletion(users.testUser.id);
      if (state === "cancelled") await deletionService.cancelDeletion(users.testUser.id);

      await expect(deletionService.executeDeletion(users.testUser.id)).rejects.toThrow(
        "Scheduled deletion is no longer due"
      );

      const user = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });
      expect(user.email).toBe(users.testUser.email);
      expect(user.deletionStatus).toBe(state === "cancelled" ? "active" : "pending_deletion");
    });

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
      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

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
      const catalogCreatedBy = extractRelationId(updatedCatalog.createdBy);
      expect(catalogCreatedBy).toBe(result.transferredToUserId);

      // Verify dataset transferred
      const updatedDataset = await payload.findByID({
        collection: "datasets",
        id: publicDataset.id,
        overrideAccess: true,
      });
      // createdBy may be populated as an object or just an ID
      const datasetCreatedBy = extractRelationId(updatedDataset.createdBy);
      expect(datasetCreatedBy).toBe(result.transferredToUserId);
    });

    /**
     * A public dataset inside a private catalog is legal — only the reverse is rejected. The
     * dataset is transferred (it is public) while the catalog is deleted (it is private), and
     * the FK's ON DELETE SET NULL then left the surviving dataset with no catalog at all,
     * which the field declares required.
     */
    it("keeps a private catalog that a surviving dataset still points at", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog With Public Dataset", isPublic: false },
        user: users.testUser,
      });

      const publicDataset = await payload.create({
        collection: "datasets",
        data: { name: "Public Dataset Inside", catalog: privateCatalog.id, isPublic: true, language: "eng" },
        user: users.testUser,
      });

      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });
      expect(result.success).toBe(true);

      // The catalog survives, owned by the system user, so the dataset keeps a valid parent.
      const keptCatalog = await payload.findByID({
        collection: "catalogs",
        id: privateCatalog.id,
        overrideAccess: true,
      });
      expect(extractRelationId(keptCatalog.createdBy)).toBe(result.transferredToUserId);
      expect(keptCatalog.isPublic).toBe(false);

      const survivingDataset = await payload.findByID({
        collection: "datasets",
        id: publicDataset.id,
        overrideAccess: true,
      });
      expect(extractRelationId(survivingDataset.catalog)).toBe(privateCatalog.id);

      // And it is still writable — a NULL catalog would fail the required-field validation.
      await expect(
        payload.update({
          collection: "datasets",
          id: publicDataset.id,
          data: { description: "still editable" },
          overrideAccess: true,
        })
      ).resolves.toBeTruthy();
    });

    // A soft-deleted dataset still holds its catalog_id. Counting without `trash: true`
    // reported zero, the catalog was deleted, and ON DELETE SET NULL stripped the parent off
    // a row that can then never be restored — `catalog` is required.
    it("keeps a private catalog that only a trashed dataset points at", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog With Trashed Dataset", isPublic: false },
        user: users.testUser,
      });

      const trashedDataset = await payload.create({
        collection: "datasets",
        data: { name: "Trashed Dataset", catalog: privateCatalog.id, isPublic: true, language: "eng" },
        user: users.testUser,
      });

      // Soft-delete: `trash: true` on DELETE means "permanently delete, trashed rows too".
      // Moving a row to the trash is an update that stamps deletedAt.
      await payload.update({
        collection: "datasets",
        id: trashedDataset.id,
        data: { deletedAt: new Date().toISOString() },
        overrideAccess: true,
      });

      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });
      expect(result.success).toBe(true);

      const keptCatalog = await payload.findByID({
        collection: "catalogs",
        id: privateCatalog.id,
        overrideAccess: true,
      });
      expect(keptCatalog.id).toBe(privateCatalog.id);

      const stillTrashed = await payload.findByID({
        collection: "datasets",
        id: trashedDataset.id,
        trash: true,
        overrideAccess: true,
      });
      expect(extractRelationId(stillTrashed.catalog)).toBe(privateCatalog.id);
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
      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

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

    it("re-checks eligibility at execution time (last-admin demoted mid-grace)", async () => {
      // Regression: invariants were only enforced at schedule time — the
      // 30-day window could invalidate them (e.g. the OTHER admin gets
      // demoted), and the executor erased the last admin anyway.
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { adminA: { role: "admin" }, adminB: { role: "admin" } });

      // Scheduling A passes — B is still an admin.
      await deletionService.scheduleDeletion(users.adminA.id);

      // During the grace period, B gets demoted; A becomes the last admin.
      await payload.update({ collection: "users", id: users.adminB.id, data: { role: "user" }, overrideAccess: true });

      await expect(deletionService.executeDeletion(users.adminA.id, { deletionType: "self" })).rejects.toThrow(
        "Cannot delete the last admin user"
      );

      // A is untouched and still pending — the maintenance job retries later.
      const adminA = await payload.findByID({ collection: "users", id: users.adminA.id, overrideAccess: true });
      expect(adminA.deletionStatus).toBe("pending_deletion");
      expect(adminA.role).toBe("admin");
    });

    it("should delete the user's scraper repos, scrapers, and runs", async () => {
      // Regression: account deletion never touched the scraper domain — a
      // deleted user's code kept executing on schedule and their webhook
      // tokens stayed live with no owner able to see or stop them.
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user", trustLevel: "3" } });

      const repo = await payload.create({
        collection: "scraper-repos",
        data: {
          name: "Deletion Repo",
          sourceType: "upload",
          code: { "scraper.py": "pass" },
          createdBy: users.testUser.id,
        },
        overrideAccess: true,
      });
      const scraper = await payload.create({
        collection: "scrapers",
        data: {
          name: "Deletion Scraper",
          slug: "deletion-scraper",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
          repoCreatedBy: users.testUser.id,
          webhookEnabled: true,
        },
        overrideAccess: true,
      });
      await payload.create({
        collection: "scraper-runs",
        data: { scraper: scraper.id, scraperOwner: users.testUser.id, status: "success", triggeredBy: "schedule" },
        overrideAccess: true,
      });

      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

      expect(result.success).toBe(true);
      expect(result.dataDeleted.scraperRepos).toBe(1);

      const [repos, scrapers, runs] = await Promise.all([
        payload.find({ collection: "scraper-repos", where: { id: { equals: repo.id } }, overrideAccess: true }),
        payload.find({ collection: "scrapers", where: { id: { equals: scraper.id } }, overrideAccess: true }),
        payload.find({ collection: "scraper-runs", where: { scraper: { equals: scraper.id } }, overrideAccess: true }),
      ]);
      expect(repos.docs).toHaveLength(0);
      expect(scrapers.docs).toHaveLength(0);
      expect(runs.docs).toHaveLength(0);
    });

    it("should delete the account even when a scraper is wedged in 'running'", async () => {
      // Regression: the scrapers beforeDelete guard refuses to delete a running
      // scraper with a 409, and scraper-repos re-raises it at repo level. A
      // worker killed mid-scrape leaves last_run_status = 'running' with
      // nothing to clear it, so ONE wedged scraper aborted and rolled back the
      // user's entire account deletion — permanently, on every retry. A user's
      // right to be erased cannot be hostage to a stuck background job.
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user", trustLevel: "3" } });

      const repo = await payload.create({
        collection: "scraper-repos",
        data: {
          name: "Wedged Repo",
          sourceType: "upload",
          code: { "scraper.py": "pass" },
          createdBy: users.testUser.id,
        },
        overrideAccess: true,
      });
      const scraper = await payload.create({
        collection: "scrapers",
        data: {
          name: "Wedged Scraper",
          slug: "wedged-scraper",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
          repoCreatedBy: users.testUser.id,
        },
        overrideAccess: true,
      });

      // lastRunStatus denies field-level writes, so claim it the way the
      // trigger routes do. No lastRunAt — this is the un-provable-age case the
      // delete guard deliberately keeps blocking.
      await payload.db.drizzle.execute(
        `UPDATE payload.scrapers SET last_run_status = 'running' WHERE id = ${scraper.id}`
      );

      const result = await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

      expect(result.success).toBe(true);
      expect(result.dataDeleted.scraperRepos).toBe(1);

      const [repos, scrapers] = await Promise.all([
        payload.find({ collection: "scraper-repos", where: { id: { equals: repo.id } }, overrideAccess: true }),
        payload.find({ collection: "scrapers", where: { id: { equals: scraper.id } }, overrideAccess: true }),
      ]);
      expect(repos.docs).toHaveLength(0);
      expect(scrapers.docs).toHaveLength(0);
    });

    it("should anonymize user and mark as deleted", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      const originalEmail = users.testUser.email;

      await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

      const deletedUser = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });

      expect(deletedUser.deletionStatus).toBe("deleted");
      expect(deletedUser.email).not.toBe(originalEmail);
      expect(deletedUser.email).toContain("deleted");
      expect(deletedUser.isActive).toBe(false);
    });

    it("should create audit log entry", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      await deletionService.executeDeletion(users.testUser.id, { deletionType: "self" });

      const auditLogs = await payload.find({
        collection: "audit-log",
        where: {
          and: [{ userId: { equals: users.testUser.id } }, { action: { equals: "account.deletion_executed" } }],
        },
        overrideAccess: true,
      });

      expect(auditLogs.docs).toHaveLength(1);
      expect(auditLogs.docs[0].userId).toBe(users.testUser.id);
      expect(auditLogs.docs[0].userEmailHash).toBeDefined();
      expect((auditLogs.docs[0].details as Record<string, unknown>).deletionType).toBe("self");
    });

    it("should roll back all changes when an error occurs mid-deletion", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Create public catalog (should be transferred, then rolled back)
      const publicCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Public Catalog", isPublic: true },
        user: users.testUser,
      });

      // Create private catalog (should be deleted, then rolled back)
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog", isPublic: false },
        user: users.testUser,
      });

      // Create private dataset (should be deleted, then rolled back)
      const privateDataset = await payload.create({
        collection: "datasets",
        data: { name: "Private Dataset", catalog: privateCatalog.id, isPublic: false, language: "eng" },
        user: users.testUser,
      });

      // Fail after the real anonymization write and its normal hooks have run.
      const hooks = payload.collections.users.config.hooks;
      const originalAfterChange = hooks.afterChange;
      const failAfterAnonymization: CollectionAfterChangeHook = ({ doc }) => {
        if (doc.id === users.testUser.id && doc.deletionStatus === "deleted") {
          throw new Error("User anonymization regression");
        }
        return doc;
      };
      hooks.afterChange = [...(originalAfterChange ?? []), failAfterAnonymization];

      try {
        await expect(deletionService.executeDeletion(users.testUser.id, { deletionType: "self" })).rejects.toThrow(
          "User anonymization regression"
        );
      } finally {
        hooks.afterChange = originalAfterChange;
      }

      // Verify public catalog ownership was NOT transferred (rolled back)
      const catalogAfter = await payload.findByID({
        collection: "catalogs",
        id: publicCatalog.id,
        overrideAccess: true,
      });
      const catalogOwner = extractRelationId(catalogAfter.createdBy);
      expect(catalogOwner).toBe(users.testUser.id);

      // Verify private catalog still exists (deletion was rolled back)
      const privateCatalogAfter = await payload.findByID({
        collection: "catalogs",
        id: privateCatalog.id,
        overrideAccess: true,
      });
      expect(privateCatalogAfter).toBeDefined();
      expect(privateCatalogAfter.name).toBe("Private Catalog");

      // Verify private dataset still exists (deletion was rolled back)
      const privateDatasetAfter = await payload.findByID({
        collection: "datasets",
        id: privateDataset.id,
        overrideAccess: true,
      });
      expect(privateDatasetAfter).toBeDefined();
      expect(privateDatasetAfter.name).toBe("Private Dataset");

      // Verify user was NOT anonymized (rolled back)
      const userAfter = await payload.findByID({ collection: "users", id: users.testUser.id, overrideAccess: true });
      expect(userAfter.deletionStatus).not.toBe("deleted");
      expect(userAfter.email).toBe(users.testUser.email);
      expect(userAfter.isActive).toBe(true);

      // Verify no deletion_executed audit log (error happened before this step)
      const auditLogs = await payload.find({
        collection: "audit-log",
        where: {
          and: [{ userId: { equals: users.testUser.id } }, { action: { equals: "account.deletion_executed" } }],
        },
        overrideAccess: true,
      });
      expect(auditLogs.docs).toHaveLength(0);
    });
  });

  describe("findDueDeletions", () => {
    it("should include all due users beyond the first hundred", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const configs = Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [`due${index}`, { role: "user" as const }])
      );
      const { users } = await withUsers(env, configs);
      const ids = Object.values(users).map((user) => user.id);
      await payload.update({
        collection: "users",
        where: { id: { in: ids } },
        data: {
          deletionStatus: "pending_deletion",
          deletionScheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
        overrideAccess: true,
      });

      const dueDeletions = await deletionService.findDueDeletions();

      expect(new Set(dueDeletions.map((user) => user.id))).toEqual(new Set(ids));
    });

    it("should find users with past due deletion dates", async () => {
      const env = { payload, seedManager: { truncate } } as any;
      const { users } = await withUsers(env, { testUser: { role: "user" } });

      // Set deletion to past date
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await payload.update({
        collection: "users",
        id: users.testUser.id,
        data: { deletionStatus: "pending_deletion", deletionScheduledAt: pastDate },
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
        data: { deletionStatus: "pending_deletion", deletionScheduledAt: futureDate },
        overrideAccess: true,
      });

      const dueDeletions = await deletionService.findDueDeletions();

      expect(dueDeletions.some((u: User) => u.id === users.testUser.id)).toBe(false);
    });
  });
});
