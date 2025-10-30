/**
 * Defines the Payload CMS collection configuration for Scheduled Imports.
 *
 * This collection manages scheduled URL-based imports that run automatically at specified intervals.
 * Each document represents a schedule configuration that triggers import-files records when due.
 *
 * Key features:
 * - Cron-based scheduling with timezone support
 * - Authentication configuration for secure URLs
 * - Automatic retry handling with exponential backoff
 * - Execution history tracking
 * - Integration with existing import pipeline.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 * @category Collections
 */

import type { CollectionConfig, Payload } from "payload";

import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";

import { createCommonConfig } from "../shared-fields";
import { authFields } from "./fields/auth-fields";
import { basicFields } from "./fields/basic-fields";
import { executionFields } from "./fields/execution-fields";
import { scheduleFields } from "./fields/schedule-fields";
import { targetFields } from "./fields/target-fields";
import { webhookFields } from "./fields/webhook-fields";
import { beforeChangeHook } from "./hooks";
import { validateCronExpression, validateUrl } from "./validation";

// Helper function to handle schedule quota tracking
const handleScheduleQuotaTracking = async ({
  data,
  operation,
  req,
  originalDoc,
  context,
}: {
  data: Record<string, unknown>;
  operation: "create" | "update";
  req: { user?: User | null; payload: Payload; context?: Record<string, any> };
  originalDoc?: Record<string, unknown>;
  context?: Record<string, any>;
}) => {
  // Skip quota checks in test environment to avoid deadlocks
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return data;
  }

  if (!req.user) {
    return data;
  }

  // Skip quota checks if flagged (prevents deadlocks from nested operations)
  if (context?.skipQuotaChecks || req.context?.skipQuotaChecks) {
    return data;
  }

  const isCreate = operation === "create";
  const isUpdate = operation === "update" && originalDoc;

  if (!isCreate && !isUpdate) return data;

  const quotaService = getQuotaService(req.payload);

  // Handle update operations (enabling/disabling)
  if (isUpdate && originalDoc.enabled !== data?.enabled) {
    if (data?.enabled === true) {
      // Check quota before enabling
      const quotaCheck = await quotaService.checkQuota(req.user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1, req);
      if (!quotaCheck.allowed) {
        const message =
          quotaCheck.remaining === 0
            ? `Maximum active schedules reached (${quotaCheck.limit}). Disable another schedule first.`
            : `Cannot enable schedule: quota exceeded`;
        throw new Error(message);
      }
      // Note: Actual increment happens in afterChange hook to avoid nested Payload operations
    }
    // Note: Decrement happens in afterChange hook to avoid nested Payload operations during transaction
  }

  // Handle new schedule creation
  if (isCreate && data?.enabled !== false) {
    const quotaCheck = await quotaService.checkQuota(req.user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1, req);
    if (!quotaCheck.allowed) {
      throw new Error(
        `Maximum active schedules reached (${quotaCheck.limit}). Disable another schedule or create this one as disabled.`
      );
    }
  }

  return data;
};

const ScheduledImports: CollectionConfig = {
  slug: "scheduled-imports",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "sourceUrl", "enabled", "nextRun", "lastRun", "updatedAt"],
    group: "Import System",
    description: "Manage scheduled URL imports that run automatically",
  },
  access: {
    // Users can only read their own scheduled imports
    read: async ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      return {
        createdBy: { equals: user.id },
      };
    },

    // Anyone authenticated can create, but createdBy will be set automatically
    // Quota check moved to beforeChange hook to avoid deadlock
    create: ({ req: { user } }) => Boolean(user),

    // Users can only update their own scheduled imports
    update: async ({ req: { user, payload }, id }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      if (!id) return false;

      try {
        // Check ownership of existing document
        const existing = await payload.findByID({
          collection: "scheduled-imports",
          id,
          overrideAccess: true,
        });

        if (!existing.createdBy) return false;
        const createdById = typeof existing.createdBy === "object" ? existing.createdBy.id : existing.createdBy;

        return createdById === user.id;
      } catch {
        return false;
      }
    },

    // Users can delete their own, admins can delete any
    delete: async ({ req: { user, payload }, id }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      if (!id) return false;

      try {
        const existing = await payload.findByID({
          collection: "scheduled-imports",
          id,
          overrideAccess: true,
        });

        if (!existing.createdBy) return false;
        const createdById = typeof existing.createdBy === "object" ? existing.createdBy.id : existing.createdBy;

        return createdById === user.id;
      } catch {
        return false;
      }
    },

    // Only owners or admins can read version history
    readVersions: async ({ req: { user, payload }, id }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      if (!id) return false;

      try {
        const existing = await payload.findByID({
          collection: "scheduled-imports",
          id,
          overrideAccess: true,
        });

        if (!existing.createdBy) return false;
        const createdById = typeof existing.createdBy === "object" ? existing.createdBy.id : existing.createdBy;

        return createdById === user.id;
      } catch {
        return false;
      }
    },
  },
  fields: [...basicFields, ...authFields, ...targetFields, ...scheduleFields, ...webhookFields, ...executionFields],
  hooks: {
    beforeChange: [
      beforeChangeHook,
      handleScheduleQuotaTracking, // This already handles quota checks
    ],
    afterChange: [
      async ({ doc, operation, req, previousDoc }) => {
        if (!req.user) return doc;

        const quotaService = getQuotaService(req.payload);

        // Track usage after successful creation of enabled schedule
        if (operation === "create" && doc.enabled !== false) {
          await quotaService.incrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1, req);
        }

        // Handle update operations (enabling/disabling)
        if (operation === "update" && previousDoc) {
          const wasEnabled = previousDoc.enabled;
          const isEnabled = doc.enabled;

          if (!wasEnabled && isEnabled) {
            // Schedule was enabled - increment usage
            await quotaService.incrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1, req);
          } else if (wasEnabled && !isEnabled) {
            // Schedule was disabled - decrement usage
            await quotaService.decrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1, req);
          }
        }

        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Decrement usage when schedule is deleted
        if (req.user && doc.enabled) {
          const quotaService = getQuotaService(req.payload);

          await quotaService.decrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1, req);
        }

        return doc;
      },
    ],
    beforeValidate: [
      // eslint-disable-next-line complexity
      async ({ data, req }) => {
        // Validate catalog access
        if (data?.catalog && req.user) {
          const catalogId = typeof data.catalog === "object" ? data.catalog.id : data.catalog;

          try {
            // Try to read the catalog - use overrideAccess to avoid deadlock
            // Access control for catalogs is already enforced at the catalog collection level
            const catalog = await req.payload.findByID({
              collection: "catalogs",
              id: catalogId,
              overrideAccess: true, // Avoid nested access control causing deadlock
            });

            // Manual access check: verify user can access this catalog
            if (catalog.createdBy) {
              const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
              if (req.user.role !== "admin" && createdById !== req.user.id && !catalog.isPublic) {
                throw new Error("You do not have permission to access this catalog");
              }
            }
          } catch (error: any) {
            // Catalog doesn't exist or access denied
            throw new Error(error.message || "You do not have permission to access this catalog");
          }
        }

        // Validate URL
        if (data?.sourceUrl) {
          const urlValidation = validateUrl(data.sourceUrl);
          if (urlValidation !== true) {
            throw new Error(urlValidation);
          }
        }

        // Validate cron expression if using cron schedule
        if (data?.scheduleType === "cron" && data?.cronExpression) {
          const cronValidation = validateCronExpression(data.cronExpression);
          if (cronValidation !== true) {
            throw new Error(cronValidation);
          }
        }

        // Validate schedule configuration
        if (data?.enabled && data.scheduleType === "frequency" && !data.frequency) {
          throw new Error("Frequency is required when schedule type is 'frequency'");
        }
        if (data?.enabled && data.scheduleType === "cron" && !data.cronExpression) {
          throw new Error("Cron expression is required when schedule type is 'cron'");
        }

        return data;
      },
    ],
  },
};

export default ScheduledImports;
