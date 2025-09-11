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
 * @module
 * @category Collections
 */

import type { CollectionConfig, Payload } from "payload";

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
}: {
  data: Record<string, unknown>;
  operation: "create" | "update";
  req: { user?: User | null; payload: Payload };
  originalDoc?: Record<string, unknown>;
}) => {
  if (!req.user) return data;

  const isCreate = operation === "create";
  const isUpdate = operation === "update" && originalDoc;

  if (!isCreate && !isUpdate) return data;

  const { getPermissionService } = await import("@/lib/services/permission-service");
  const { QUOTA_TYPES, USAGE_TYPES } = await import("@/lib/constants/permission-constants");
  const permissionService = getPermissionService(req.payload);

  // Handle update operations (enabling/disabling)
  if (isUpdate && originalDoc.enabled !== data?.enabled) {
    if (data?.enabled === true) {
      // Check quota before enabling
      const quotaCheck = await permissionService.checkQuota(req.user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);
      if (!quotaCheck.allowed) {
        const message =
          quotaCheck.remaining === 0
            ? `Maximum active schedules reached (${quotaCheck.limit}). Disable another schedule first.`
            : `Cannot enable schedule: quota exceeded`;
        throw new Error(message);
      }
      // Increment usage
      await permissionService.incrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1);
    } else if (data?.enabled === false) {
      // Decrement usage when disabling
      await permissionService.decrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1);
    }
  }

  // Handle new schedule creation
  if (isCreate && data?.enabled !== false) {
    const quotaCheck = await permissionService.checkQuota(req.user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);
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
    read: ({ req: { user } }) => Boolean(user),
    create: async ({ req }) => {
      const { user } = req;
      if (!user) return false;

      // Check quota for active schedules
      const { getPermissionService } = await import("@/lib/services/permission-service");
      const { QUOTA_TYPES } = await import("@/lib/constants/permission-constants");
      const permissionService = getPermissionService(req.payload);

      const quotaCheck = await permissionService.checkQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES);
      // Payload doesn't allow throwing errors in access control, just return boolean
      return quotaCheck.allowed;
    },
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => user?.role === "admin" || false,
  },
  fields: [...basicFields, ...authFields, ...targetFields, ...scheduleFields, ...webhookFields, ...executionFields],
  hooks: {
    beforeChange: [beforeChangeHook, handleScheduleQuotaTracking],
    afterChange: [
      async ({ doc, operation, req, previousDoc: _previousDoc }) => {
        // Track usage after successful creation
        if (req.user && operation === "create" && doc.enabled !== false) {
          const { getPermissionService } = await import("@/lib/services/permission-service");
          const { USAGE_TYPES } = await import("@/lib/constants/permission-constants");
          const permissionService = getPermissionService(req.payload);

          await permissionService.incrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1);
        }

        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Decrement usage when schedule is deleted
        if (req.user && doc.enabled) {
          const { getPermissionService } = await import("@/lib/services/permission-service");
          const { USAGE_TYPES } = await import("@/lib/constants/permission-constants");
          const permissionService = getPermissionService(req.payload);

          await permissionService.decrementUsage(req.user.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1);
        }

        return doc;
      },
    ],
    beforeValidate: [
      ({ data }) => {
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
