/**
 * Service for managing account deletion with grace period support.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import { createHash } from "crypto";
import type { Payload } from "payload";

import type { User } from "@/payload-types";

import { PROCESSING_STAGE } from "../constants/import-constants";
import { createLogger, logError } from "../logger";
import {
  sendDeletionCancelledEmail,
  sendDeletionCompletedEmail,
  sendDeletionScheduledEmail,
} from "./account-deletion-emails";
import type {
  CanDeleteResult,
  DeletionSummary,
  ExecuteDeletionResult,
  ScheduleDeletionResult,
} from "./account-deletion-types";
import { getSystemUserService, SYSTEM_USER_EMAIL } from "./system-user-service";

export type { CanDeleteResult, DeletionSummary, ExecuteDeletionResult, ScheduleDeletionResult };

const logger = createLogger("account-deletion-service");

/** Grace period in days before account is permanently deleted. */
export const DELETION_GRACE_PERIOD_DAYS = 7;

/** Error message for user not found. */
const USER_NOT_FOUND = "User not found";

const hashEmail = (email: string): string => createHash("sha256").update(email.toLowerCase()).digest("hex");
const hashIpAddress = (ip: string): string => createHash("sha256").update(ip).digest("hex");

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
      user = await this.payload.findByID({
        collection: "users",
        id: userId,
        overrideAccess: true,
      });
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
            { deletionStatus: { not_equals: "deleted" } },
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
      collection: "import-jobs",
      where: {
        and: [
          { "dataset.createdBy": { equals: userId } },
          {
            stage: {
              not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED],
            },
          },
        ],
      },
      limit: 1,
      overrideAccess: true,
    });

    if (activeJobs.docs.length > 0) {
      return {
        allowed: false,
        reason: "User has active import jobs. Please wait for them to complete.",
      };
    }

    return { allowed: true };
  }

  /**
   * Get a summary of data that will be affected by deletion.
   */
  async getDeletionSummary(userId: number): Promise<DeletionSummary> {
    // Count catalogs
    const [publicCatalogs, privateCatalogs] = await Promise.all([
      this.payload.count({
        collection: "catalogs",
        where: {
          and: [{ createdBy: { equals: userId } }, { isPublic: { equals: true } }],
        },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "catalogs",
        where: {
          and: [{ createdBy: { equals: userId } }, { isPublic: { equals: false } }],
        },
        overrideAccess: true,
      }),
    ]);

    // Count datasets
    const [publicDatasets, privateDatasets] = await Promise.all([
      this.payload.count({
        collection: "datasets",
        where: {
          and: [{ createdBy: { equals: userId } }, { isPublic: { equals: true } }],
        },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "datasets",
        where: {
          and: [{ createdBy: { equals: userId } }, { isPublic: { equals: false } }],
        },
        overrideAccess: true,
      }),
    ]);

    // Count events in public vs private datasets
    // First get all dataset IDs for this user
    const userDatasets = await this.payload.find({
      collection: "datasets",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    const publicDatasetIds = userDatasets.docs.filter((d) => d.isPublic).map((d) => d.id);
    const privateDatasetIds = userDatasets.docs.filter((d) => !d.isPublic).map((d) => d.id);

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
    const [scheduledImports, importFiles, media] = await Promise.all([
      this.payload.count({
        collection: "scheduled-imports",
        where: { createdBy: { equals: userId } },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "import-files",
        where: { user: { equals: userId } },
        overrideAccess: true,
      }),
      this.payload.count({
        collection: "media",
        where: { createdBy: { equals: userId } },
        overrideAccess: true,
      }),
    ]);

    return {
      catalogs: {
        public: publicCatalogs.totalDocs,
        private: privateCatalogs.totalDocs,
      },
      datasets: {
        public: publicDatasets.totalDocs,
        private: privateDatasets.totalDocs,
      },
      events: {
        inPublicDatasets: eventsInPublic,
        inPrivateDatasets: eventsInPrivate,
      },
      scheduledImports: scheduledImports.totalDocs,
      importFiles: importFiles.totalDocs,
      media: media.totalDocs,
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

    const user = await this.payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    const summary = await this.getDeletionSummary(userId);
    const now = new Date();
    const deletionDate = new Date(now.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

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

    // Send confirmation email
    const cancelUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;
    await sendDeletionScheduledEmail(this.payload, user.email, user.firstName, deletionDate.toISOString(), cancelUrl);

    return {
      success: true,
      deletionScheduledAt: deletionDate.toISOString(),
      summary,
    };
  }

  /**
   * Cancel a scheduled deletion.
   */
  async cancelDeletion(userId: number): Promise<void> {
    const user = await this.payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    if (user.deletionStatus !== "pending_deletion") {
      throw new Error("No pending deletion to cancel");
    }

    await this.payload.update({
      collection: "users",
      id: userId,
      data: {
        deletionStatus: "active",
        deletionRequestedAt: null,
        deletionScheduledAt: null,
      },
      overrideAccess: true,
    });

    logger.info({ userId }, "Account deletion cancelled");

    // Send cancellation email
    await sendDeletionCancelledEmail(this.payload, user.email, user.firstName);
  }

  /**
   * Execute account deletion (called by background job after grace period).
   */
  async executeDeletion(
    userId: number,
    options: {
      deletedBy?: number;
      deletionType?: "self" | "admin" | "scheduled";
      ipAddress?: string;
    } = {}
  ): Promise<ExecuteDeletionResult> {
    const { deletedBy, deletionType = "scheduled", ipAddress } = options;

    const user = await this.payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

    if (!user) {
      throw new Error(USER_NOT_FOUND);
    }

    // Get system user for public data transfer
    const systemUserService = getSystemUserService(this.payload);
    const systemUser = await systemUserService.getOrCreateSystemUser();

    logger.info({ userId, systemUserId: systemUser.id, deletionType }, "Starting account deletion execution");

    const result: ExecuteDeletionResult = {
      success: false,
      deletedUserId: userId,
      transferredToUserId: systemUser.id,
      dataTransferred: { catalogs: 0, datasets: 0 },
      dataDeleted: { catalogs: 0, datasets: 0, events: 0, scheduledImports: 0, importFiles: 0 },
    };

    try {
      // Transfer public data to system user
      await this.transferPublicData(userId, systemUser.id, result);

      // Delete private data
      await this.deletePrivateData(userId, result);

      // Delete user resources (scheduled imports, import files)
      await this.deleteUserResources(userId, result);

      // Finalize user deletion and create audit log
      await this.finalizeAndAudit(userId, user, deletedBy, deletionType, ipAddress, result);

      result.success = true;
      logger.info({ userId, result }, "Account deletion completed");

      // Send completion email (to original email before anonymization)
      await sendDeletionCompletedEmail(
        this.payload,
        user.email,
        user.firstName,
        result.dataTransferred,
        result.dataDeleted
      );

      return result;
    } catch (error) {
      logError(error, "Account deletion failed", { userId });
      throw error;
    }
  }

  /**
   * Transfer public catalogs and datasets to system user.
   */
  private async transferPublicData(userId: number, systemUserId: number, result: ExecuteDeletionResult): Promise<void> {
    // Transfer public catalogs
    const publicCatalogs = await this.payload.find({
      collection: "catalogs",
      where: {
        and: [{ createdBy: { equals: userId } }, { isPublic: { equals: true } }],
      },
      limit: 10000,
      overrideAccess: true,
    });

    for (const catalog of publicCatalogs.docs) {
      await this.payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { createdBy: systemUserId },
        overrideAccess: true,
      });
      result.dataTransferred.catalogs++;
    }

    // Transfer public datasets
    const publicDatasets = await this.payload.find({
      collection: "datasets",
      where: {
        and: [{ createdBy: { equals: userId } }, { isPublic: { equals: true } }],
      },
      limit: 10000,
      overrideAccess: true,
    });

    for (const dataset of publicDatasets.docs) {
      await this.payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { createdBy: systemUserId },
        overrideAccess: true,
      });
      result.dataTransferred.datasets++;
    }
  }

  /**
   * Delete private datasets, events, and catalogs.
   */
  private async deletePrivateData(userId: number, result: ExecuteDeletionResult): Promise<void> {
    // Delete private datasets and their events
    const privateDatasets = await this.payload.find({
      collection: "datasets",
      where: {
        and: [{ createdBy: { equals: userId } }, { isPublic: { equals: false } }],
      },
      limit: 10000,
      overrideAccess: true,
    });

    for (const dataset of privateDatasets.docs) {
      // Delete events in this dataset
      const events = await this.payload.find({
        collection: "events",
        where: { dataset: { equals: dataset.id } },
        limit: 10000,
        overrideAccess: true,
      });

      for (const event of events.docs) {
        await this.payload.delete({
          collection: "events",
          id: event.id,
          overrideAccess: true,
        });
        result.dataDeleted.events++;
      }

      // Delete the dataset
      await this.payload.delete({
        collection: "datasets",
        id: dataset.id,
        overrideAccess: true,
      });
      result.dataDeleted.datasets++;
    }

    // Delete private catalogs
    const privateCatalogs = await this.payload.find({
      collection: "catalogs",
      where: {
        and: [{ createdBy: { equals: userId } }, { isPublic: { equals: false } }],
      },
      limit: 10000,
      overrideAccess: true,
    });

    for (const catalog of privateCatalogs.docs) {
      await this.payload.delete({
        collection: "catalogs",
        id: catalog.id,
        overrideAccess: true,
      });
      result.dataDeleted.catalogs++;
    }
  }

  /**
   * Delete scheduled imports and import files.
   */
  private async deleteUserResources(userId: number, result: ExecuteDeletionResult): Promise<void> {
    // Delete scheduled imports
    const scheduledImports = await this.payload.find({
      collection: "scheduled-imports",
      where: { createdBy: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    for (const schedule of scheduledImports.docs) {
      await this.payload.delete({
        collection: "scheduled-imports",
        id: schedule.id,
        overrideAccess: true,
      });
      result.dataDeleted.scheduledImports++;
    }

    // Delete import files
    const importFiles = await this.payload.find({
      collection: "import-files",
      where: { user: { equals: userId } },
      limit: 10000,
      overrideAccess: true,
    });

    for (const file of importFiles.docs) {
      await this.payload.delete({
        collection: "import-files",
        id: file.id,
        overrideAccess: true,
      });
      result.dataDeleted.importFiles++;
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
    result: ExecuteDeletionResult
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
    });

    // Invalidate all sessions
    await this.invalidateAllSessions(userId);

    // Create audit log entry
    await this.payload.create({
      collection: "deletion-audit-log",
      data: {
        deletedUserId: userId,
        deletedUserEmailHash: hashEmail(user.email),
        deletedAt: new Date().toISOString(),
        deletionRequestedAt: user.deletionRequestedAt ?? undefined,
        deletedBy: deletedBy ?? undefined,
        deletionType,
        dataTransferred: result.dataTransferred,
        dataDeleted: result.dataDeleted,
        ipAddressHash: ipAddress ? hashIpAddress(ipAddress) : undefined,
      },
      overrideAccess: true,
    });
  }

  /**
   * Invalidate all sessions for a user.
   */
  private async invalidateAllSessions(userId: number): Promise<void> {
    try {
      await this.payload.db.drizzle.execute(sql`DELETE FROM payload.users_sessions WHERE _parent_id = ${userId}`);
      logger.debug({ userId }, "All user sessions invalidated");
    } catch (error) {
      logError(error, "Failed to invalidate sessions", { userId });
      // Don't throw - session invalidation failure shouldn't block deletion
    }
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

// Singleton instance
let accountDeletionService: AccountDeletionService | null = null;

/**
 * Get the account deletion service singleton.
 */
export const getAccountDeletionService = (payload: Payload): AccountDeletionService => {
  accountDeletionService ??= new AccountDeletionService(payload);
  return accountDeletionService;
};

/**
 * Reset the account deletion service singleton (for testing).
 */
export const resetAccountDeletionService = (): void => {
  accountDeletionService = null;
};
