/**
 * Service for managing account deletion with grace period support.
 *
 * The {@link AccountDeletionService.executeDeletion} method wraps all database
 * operations in a Payload transaction so that partial failures roll back
 * cleanly. Emails are sent **after** the transaction commits.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

import { getAppConfig } from "@/lib/config/app-config";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { getBaseUrl } from "@/lib/utils/base-url";
import { countUserDocs, findUserDocs } from "@/lib/utils/user-data";
import type { User } from "@/payload-types";

import { PROCESSING_STAGE } from "../constants/ingest-constants";
import { createLogger, logError } from "../logger";
import { AUDIT_ACTIONS, auditLog } from "../services/audit-log-service";
import { sendDeletionCancelledEmail, sendDeletionCompletedEmail, sendDeletionScheduledEmail } from "./deletion-emails";
import type { CanDeleteResult, DeletionSummary, ExecuteDeletionResult, ScheduleDeletionResult } from "./deletion-types";
import { createSystemUserService, SYSTEM_USER_EMAIL } from "./system-user";

/**
 * Minimal request object for Payload transaction management.
 *
 * Includes `context` because Payload's internal operations destructure
 * `req.context` in hooks. An empty object is safe and prevents errors.
 */
type TransactionReq = Pick<PayloadRequest, "payload" | "transactionID" | "context">;

export type { CanDeleteResult, DeletionSummary, ExecuteDeletionResult, ScheduleDeletionResult };

const logger = createLogger("account-deletion-service");

export { DELETION_GRACE_PERIOD_DAYS } from "@/lib/constants/account-constants";

/** Error message for user not found. */
const USER_NOT_FOUND = "User not found";

/**
 * Service for managing account deletion.
 */
export class AccountDeletionService {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Check if a user can be deleted.
   */
  async canDeleteUser(userId: number): Promise<CanDeleteResult> {
    let user;
    try {
      user = await this.payload.findByID({ collection: "users", id: userId, overrideAccess: true });
    } catch {
      return { allowed: false, reason: USER_NOT_FOUND };
    }

    if (!user) {
      return { allowed: false, reason: USER_NOT_FOUND };
    }

    // Cannot delete system user
    if (user.email === SYSTEM_USER_EMAIL) {
      return { allowed: false, reason: "System user cannot be deleted" };
    }

    // Cannot delete if already deleted
    if (user.deletionStatus === "deleted") {
      return { allowed: false, reason: "User is already deleted" };
    }

    // Cannot delete the last admin
    if (user.role === "admin") {
      const adminCount = await this.payload.count({
        collection: "users",
        where: {
          and: [
            { role: { equals: "admin" } },
            { deletionStatus: { not_in: ["deleted", "pending_deletion"] } },
            { id: { not_equals: userId } },
          ],
        },
        overrideAccess: true,
      });

      if (adminCount.totalDocs === 0) {
        return { allowed: false, reason: "Cannot delete the last admin user" };
      }
    }

    // Check for active import jobs
    const activeJobs = await this.payload.find({
      collection: "ingest-jobs",
      where: {
        and: [
          { "dataset.createdBy": { equals: userId } },
          { stage: { not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED] } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    });

    if (activeJobs.docs.length > 0) {
      return { allowed: false, reason: "User has active import jobs. Please wait for them to complete." };
    }

    return { allowed: true };
  }

  /**
   * Get a summary of data that will be affected by deletion.
   */
  async getDeletionSummary(userId: number): Promise<DeletionSummary> {
    const isPublicFilter = [{ isPublic: { equals: true } }];
    const isPrivateFilter = [{ isPublic: { equals: false } }];

    // Count catalogs and datasets by visibility
    const [publicCatalogs, privateCatalogs, publicDatasets, privateDatasets] = await Promise.all([
      countUserDocs(this.payload, "catalogs", userId, { extraWhere: isPublicFilter }),
      countUserDocs(this.payload, "catalogs", userId, { extraWhere: isPrivateFilter }),
      countUserDocs(this.payload, "datasets", userId, { extraWhere: isPublicFilter }),
      countUserDocs(this.payload, "datasets", userId, { extraWhere: isPrivateFilter }),
    ]);

    // Count events in public vs private datasets
    // First get all dataset IDs for this user
    const userDatasets = await findUserDocs(this.payload, "datasets", userId, { limit: 10000 });

    const publicDatasetIds = userDatasets.filter((d) => d.isPublic).map((d) => d.id);
    const privateDatasetIds = userDatasets.filter((d) => !d.isPublic).map((d) => d.id);

    let eventsInPublic = 0;
    let eventsInPrivate = 0;

    if (publicDatasetIds.length > 0) {
      const publicEvents = await this.payload.count({
        collection: "events",
        where: { dataset: { in: publicDatasetIds } },
        overrideAccess: true,
      });
      eventsInPublic = publicEvents.totalDocs;
    }

    if (privateDatasetIds.length > 0) {
      const privateEvents = await this.payload.count({
        collection: "events",
        where: { dataset: { in: privateDatasetIds } },
        overrideAccess: true,
      });
      eventsInPrivate = privateEvents.totalDocs;
    }

    // Count other entities
    const [scheduledIngests, importFiles, media, views, dataExports] = await Promise.all([
      countUserDocs(this.payload, "scheduled-ingests", userId),
      countUserDocs(this.payload, "ingest-files", userId, { userField: "user" }),
      countUserDocs(this.payload, "media", userId),
      countUserDocs(this.payload, "views", userId),
      countUserDocs(this.payload, "data-exports", userId, { userField: "user" }),
    ]);

    return {
      catalogs: { public: publicCatalogs, private: privateCatalogs },
      datasets: { public: publicDatasets, private: privateDatasets },
      events: { inPublicDatasets: eventsInPublic, inPrivateDatasets: eventsInPrivate },
      scheduledIngests,
      importFiles,
      media,
      views,
      dataExports,
    };
  }

  /**
   * Schedule account deletion with grace period.
   */
  async scheduleDeletion(userId: number): Promise<ScheduleDeletionResult> {
    const canDelete = await this.canDeleteUser(userId);
    if (!canDelete.allowed) {
      throw new Error(canDelete.reason);
    }

    const user = await this.payload.findByID({ collection: "users", id: userId, overrideAccess: true });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    const summary = await this.getDeletionSummary(userId);
    const now = new Date();
    const gracePeriodDays = getAppConfig().account.deletionGracePeriodDays;
    const deletionDate = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    await this.payload.update({
      collection: "users",
      id: userId,
      data: {
        deletionStatus: "pending_deletion",
        deletionRequestedAt: now.toISOString(),
        deletionScheduledAt: deletionDate.toISOString(),
      },
      overrideAccess: true,
    });

    logger.info({ userId, deletionScheduledAt: deletionDate.toISOString() }, "Account deletion scheduled");

    // Send confirmation email — best-effort, state change already succeeded
    try {
      const baseUrl = getBaseUrl();
      const cancelUrl = `${baseUrl}/account/settings`;
      await sendDeletionScheduledEmail(
        this.payload,
        user.email,
        user.firstName,
        deletionDate.toISOString(),
        cancelUrl,
        user.locale
      );
    } catch (error) {
      logError(error, "Failed to send deletion scheduled email", { userId });
    }

    return { success: true, deletionScheduledAt: deletionDate.toISOString(), summary };
  }

  /**
   * Cancel a scheduled deletion.
   */
  async cancelDeletion(userId: number): Promise<void> {
    const user = await this.payload.findByID({ collection: "users", id: userId, overrideAccess: true });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    if (user.deletionStatus !== "pending_deletion") {
      throw new Error("No pending deletion to cancel");
    }

    await this.payload.update({
      collection: "users",
      id: userId,
      data: { deletionStatus: "active", deletionRequestedAt: null, deletionScheduledAt: null },
      overrideAccess: true,
    });

    logger.info({ userId }, "Account deletion cancelled");

    // Send cancellation email — best-effort, state change already succeeded
    try {
      await sendDeletionCancelledEmail(this.payload, user.email, user.firstName, user.locale);
    } catch (error) {
      logError(error, "Failed to send deletion cancelled email", { userId });
    }
  }

  /**
   * Execute account deletion (called by background job after grace period).
   *
   * All database mutations (transfers, deletes, user anonymization, audit log)
   * are wrapped in a single Payload transaction. If any step fails the entire
   * operation is rolled back, preventing inconsistent state.
   *
   * Emails are sent **after** the transaction commits so that a failed email
   * does not trigger a rollback of the deletion itself.
   */
  async executeDeletion(
    userId: number,
    options: { deletedBy?: number; deletionType?: "self" | "admin" | "scheduled"; ipAddress?: string } = {}
  ): Promise<ExecuteDeletionResult> {
    const { deletedBy, deletionType = "scheduled", ipAddress } = options;

    const user = await this.payload.findByID({ collection: "users", id: userId, overrideAccess: true });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    // Get system user for public data transfer (outside transaction — read-only)
    const systemUserService = createSystemUserService(this.payload);
    const systemUser = await systemUserService.getOrCreateSystemUser();

    logger.info({ userId, systemUserId: systemUser.id, deletionType }, "Starting account deletion execution");

    const result: ExecuteDeletionResult = {
      success: false,
      deletedUserId: userId,
      transferredToUserId: systemUser.id,
      dataTransferred: { catalogs: 0, datasets: 0 },
      dataDeleted: { catalogs: 0, datasets: 0, events: 0, scheduledIngests: 0, importFiles: 0 },
    };

    // Create a minimal req object for Payload's transaction utilities.
    // `context` must be present because Payload operations destructure it in hooks.
    const req = { payload: this.payload, transactionID: undefined, context: {} } as TransactionReq;

    try {
      // Begin a Payload-managed transaction
      const ownsTransaction = await initTransaction(req);

      try {
        // Transfer public data to system user
        await this.transferPublicData(userId, systemUser.id, user.email, result, req);

        // Delete private data
        await this.deletePrivateData(userId, result, req);

        // Delete user resources (scheduled ingests, import files)
        await this.deleteUserResources(userId, result, req);

        // Finalize user deletion and create audit log
        await this.finalizeAndAudit(userId, user, deletedBy, deletionType, ipAddress, result, req);

        // Commit the transaction (only if we own it)
        if (ownsTransaction) {
          await commitTransaction(req);
        }
      } catch (error) {
        // Roll back on any failure
        if (ownsTransaction) {
          await killTransaction(req);
        }
        throw error;
      }

      result.success = true;
      logger.info({ userId, result }, "Account deletion completed");

      // Send completion email AFTER commit — best-effort, deletion already succeeded
      try {
        await sendDeletionCompletedEmail(
          this.payload,
          user.email,
          user.firstName,
          result.dataTransferred,
          result.dataDeleted,
          user.locale
        );
      } catch (error) {
        logError(error, "Failed to send deletion completed email", { userId });
      }

      return result;
    } catch (error) {
      logError(error, "Account deletion failed — transaction rolled back", { userId });
      throw error;
    }
  }

  /**
   * Transfer public catalogs and datasets to system user.
   */
  private async transferPublicData(
    userId: number,
    systemUserId: number,
    userEmail: string,
    result: ExecuteDeletionResult,
    req: TransactionReq
  ): Promise<void> {
    const isPublicFilter = [{ isPublic: { equals: true } }];

    // Transfer public catalogs
    const publicCatalogs = await findUserDocs(this.payload, "catalogs", userId, { extraWhere: isPublicFilter });

    for (const catalog of publicCatalogs) {
      await this.payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { createdBy: systemUserId },
        overrideAccess: true,
        req,
      });
      await auditLog(
        this.payload,
        {
          action: AUDIT_ACTIONS.CATALOG_OWNERSHIP_TRANSFERRED,
          userId,
          userEmail,
          details: { catalogId: catalog.id, reason: "account_deletion", newOwnerId: systemUserId },
        },
        { req }
      );
      result.dataTransferred.catalogs++;
    }

    // Transfer public datasets
    const publicDatasets = await findUserDocs(this.payload, "datasets", userId, { extraWhere: isPublicFilter });

    for (const dataset of publicDatasets) {
      await this.payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { createdBy: systemUserId },
        overrideAccess: true,
        req,
      });
      await auditLog(
        this.payload,
        {
          action: AUDIT_ACTIONS.DATASET_OWNERSHIP_TRANSFERRED,
          userId,
          userEmail,
          details: { datasetId: dataset.id, reason: "account_deletion", newOwnerId: systemUserId },
        },
        { req }
      );
      result.dataTransferred.datasets++;
    }
  }

  /**
   * Delete private datasets, events, and catalogs.
   */
  private async deletePrivateData(userId: number, result: ExecuteDeletionResult, req: TransactionReq): Promise<void> {
    const isPrivateFilter = [{ isPublic: { equals: false } }];

    // Delete private datasets and their events
    const privateDatasets = await findUserDocs(this.payload, "datasets", userId, { extraWhere: isPrivateFilter });

    for (const dataset of privateDatasets) {
      // Delete events in this dataset
      const events = await this.payload.find({
        collection: "events",
        where: { dataset: { equals: dataset.id } },
        pagination: false,
        overrideAccess: true,
        req,
      });

      for (const event of events.docs) {
        await this.payload.delete({ collection: "events", id: event.id, overrideAccess: true, req });
        result.dataDeleted.events++;
      }

      // Delete the dataset
      await this.payload.delete({ collection: "datasets", id: dataset.id, overrideAccess: true, req });
      result.dataDeleted.datasets++;
    }

    // Delete private catalogs
    const privateCatalogs = await findUserDocs(this.payload, "catalogs", userId, { extraWhere: isPrivateFilter });

    for (const catalog of privateCatalogs) {
      await this.payload.delete({ collection: "catalogs", id: catalog.id, overrideAccess: true, req });
      result.dataDeleted.catalogs++;
    }
  }

  /**
   * Delete scheduled ingests and import files.
   */
  private async deleteUserResources(userId: number, result: ExecuteDeletionResult, req: TransactionReq): Promise<void> {
    // Delete scheduled ingests
    const scheduledIngests = await findUserDocs(this.payload, "scheduled-ingests", userId);

    for (const schedule of scheduledIngests) {
      await this.payload.delete({ collection: "scheduled-ingests", id: schedule.id, overrideAccess: true, req });
      result.dataDeleted.scheduledIngests++;
    }

    // Delete import files
    const importFiles = await findUserDocs(this.payload, "ingest-files", userId, { userField: "user" });

    for (const file of importFiles) {
      await this.payload.delete({ collection: "ingest-files", id: file.id, overrideAccess: true, req });
      result.dataDeleted.importFiles++;
    }

    // Delete views created by this user
    const views = await this.payload.find({
      collection: "views",
      where: { createdBy: { equals: userId } },
      pagination: false,
      overrideAccess: true,
      req,
    });

    for (const view of views.docs) {
      await this.payload.delete({ collection: "views", id: view.id, overrideAccess: true, req });
    }

    if (views.docs.length > 0) {
      logger.info({ userId, viewsDeleted: views.docs.length }, "Deleted user views");
    }

    // Delete data exports for this user
    const dataExports = await this.payload.find({
      collection: "data-exports",
      where: { user: { equals: userId } },
      pagination: false,
      overrideAccess: true,
      req,
    });

    for (const exportRecord of dataExports.docs) {
      await this.payload.delete({ collection: "data-exports", id: exportRecord.id, overrideAccess: true, req });
    }

    if (dataExports.docs.length > 0) {
      logger.info({ userId, exportsDeleted: dataExports.docs.length }, "Deleted user data exports");
    }
  }

  /**
   * Finalize user deletion: anonymize PII, invalidate sessions, create audit log.
   */
  private async finalizeAndAudit(
    userId: number,
    user: User,
    deletedBy: number | undefined,
    deletionType: "self" | "admin" | "scheduled",
    ipAddress: string | undefined,
    result: ExecuteDeletionResult,
    req: TransactionReq
  ): Promise<void> {
    // Clear user PII and mark as deleted
    await this.payload.update({
      collection: "users",
      id: userId,
      data: {
        deletionStatus: "deleted",
        email: `deleted-${userId}-${Date.now()}@deleted.timetiles.internal`,
        firstName: null,
        lastName: null,
        isActive: false,
      },
      overrideAccess: true,
      req,
    });

    // Invalidate all sessions
    await this.invalidateAllSessions(userId, req);

    // Create audit log entry
    await auditLog(
      this.payload,
      {
        action: AUDIT_ACTIONS.DELETION_EXECUTED,
        userId,
        userEmail: user.email,
        performedBy: deletedBy,
        ipAddress,
        details: {
          deletionType,
          deletionRequestedAt: user.deletionRequestedAt ?? undefined,
          dataTransferred: result.dataTransferred,
          dataDeleted: result.dataDeleted,
        },
      },
      { req }
    );
  }

  /**
   * Invalidate all sessions for a user.
   *
   * Uses the transaction-aware drizzle instance when a transaction is active,
   * so session deletion is rolled back together with other operations on failure.
   */
  private async invalidateAllSessions(userId: number, req?: TransactionReq): Promise<void> {
    try {
      const drizzle = await this.getTransactionAwareDrizzle(req);
      await drizzle.execute(sql`DELETE FROM payload.users_sessions WHERE _parent_id = ${userId}`);
      logger.debug({ userId }, "All user sessions invalidated");
    } catch (error) {
      logError(error, "Failed to invalidate sessions", { userId });
      // Don't throw - session invalidation failure shouldn't block deletion
    }
  }

  private getTransactionAwareDrizzle(req?: TransactionReq) {
    return getTransactionAwareDrizzle(this.payload, req);
  }

  /**
   * Find users with pending deletions that are due.
   */
  async findDueDeletions(): Promise<User[]> {
    const now = new Date();

    const pendingDeletions = await this.payload.find({
      collection: "users",
      where: {
        and: [
          { deletionStatus: { equals: "pending_deletion" } },
          { deletionScheduledAt: { less_than_equal: now.toISOString() } },
        ],
      },
      limit: 100,
      overrideAccess: true,
    });

    return pendingDeletions.docs;
  }
}

/**
 * Create an account deletion service instance.
 *
 * Returns a fresh instance each call. The service is stateless (all data
 * lives in the database), so there is no benefit to caching the instance.
 */
export const createAccountDeletionService = (payload: Payload): AccountDeletionService =>
  new AccountDeletionService(payload);
