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

import type { CollectionConfig, Payload, PayloadRequest } from "payload";

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

// Helper to check if quota checks should be skipped
const shouldSkipQuotaChecks = (
  req: { user?: User | null; context?: Record<string, unknown> },
  context?: Record<string, unknown>
): boolean =>
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  !req.user ||
  Boolean(context?.skipQuotaChecks || req.context?.skipQuotaChecks);

// Helper to check active schedules quota
const checkActiveSchedulesQuota = async (
  user: User,
  quotaService: ReturnType<typeof getQuotaService>,
  _req: PayloadRequest
): Promise<void> => {
  const quotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);
  if (!quotaCheck.allowed) {
    const message =
      quotaCheck.remaining === 0
        ? `Maximum active schedules reached (${quotaCheck.limit}). Disable another schedule first.`
        : `Cannot enable schedule: quota exceeded`;
    throw new Error(message);
  }
};

// Helper to check if update is enabling a schedule
const isEnablingSchedule = (originalDoc: Record<string, unknown>, data: Record<string, unknown>): boolean => {
  return originalDoc.enabled !== data?.enabled && data?.enabled === true;
};

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
  req: { user?: User | null; payload: Payload; context?: Record<string, unknown> };
  originalDoc?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  if (shouldSkipQuotaChecks(req, context)) {
    return data;
  }

  const isCreate = operation === "create";
  const isUpdate = operation === "update" && originalDoc;

  if (!isCreate && !isUpdate) return data;

  const quotaService = getQuotaService(req.payload);

  // Handle update operations (enabling a disabled schedule)
  if (isUpdate && isEnablingSchedule(originalDoc, data)) {
    await checkActiveSchedulesQuota(req.user!, quotaService, req as PayloadRequest);
    // Note: Actual increment happens in afterChange hook to avoid nested Payload operations
    return data;
  }

  // Handle new schedule creation (enabled by default)
  if (isCreate && data?.enabled !== false) {
    await checkActiveSchedulesQuota(req.user!, quotaService, req as PayloadRequest);
  }

  return data;
};

// Helper to validate catalog access
const validateCatalogAccess = async (data: unknown, req: PayloadRequest): Promise<void> => {
  const typedData = data as Record<string, unknown> | undefined;
  if (!typedData?.catalog || !req.user) return;

  const catalogId =
    typeof typedData.catalog === "object" ? (typedData.catalog as { id: string | number }).id : typedData.catalog;

  try {
    const catalog = await req.payload.findByID({
      collection: "catalogs",
      id: catalogId as string | number,
      overrideAccess: true,
    });

    if (catalog.createdBy) {
      const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
      if (req.user.role !== "admin" && createdById !== req.user.id && !catalog.isPublic) {
        throw new Error("You do not have permission to access this catalog");
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "You do not have permission to access this catalog";
    throw new Error(message);
  }
};

// Helper to validate source URL
const validateSourceUrl = (data: unknown): void => {
  const typedData = data as Record<string, unknown> | undefined;
  if (!typedData?.sourceUrl) return;

  const urlValidation = validateUrl(typedData.sourceUrl as string);
  if (urlValidation !== true) {
    throw new Error(urlValidation);
  }
};

// Helper to validate cron expression
const validateCronSchedule = (data: unknown): void => {
  const typedData = data as Record<string, unknown> | undefined;
  if (typedData?.scheduleType !== "cron" || !typedData?.cronExpression) return;

  const cronValidation = validateCronExpression(typedData.cronExpression as string);
  if (cronValidation !== true) {
    throw new Error(cronValidation);
  }
};

// Helper to validate schedule configuration
const validateScheduleConfig = (data: unknown): void => {
  const typedData = data as Record<string, unknown> | undefined;
  if (!typedData?.enabled) return;

  if (typedData.scheduleType === "frequency" && !typedData.frequency) {
    throw new Error("Frequency is required when schedule type is 'frequency'");
  }

  if (typedData.scheduleType === "cron" && !typedData.cronExpression) {
    throw new Error("Cron expression is required when schedule type is 'cron'");
  }
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
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }): boolean | { createdBy: { equals: string | number } } => {
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
      async ({ data, operation, req }) => {
        if (!data) return data;

        // Set createdBy on create operation (before validation runs)
        if (operation === "create" && req.user && !data.createdBy) {
          data.createdBy = req.user.id;
        }

        // Validate catalog access
        await validateCatalogAccess(data, req);

        // Validate URL
        validateSourceUrl(data);

        // Validate cron expression if using cron schedule
        validateCronSchedule(data);

        // Validate schedule configuration
        validateScheduleConfig(data);

        return data;
      },
    ],
  },
};

export default ScheduledImports;
