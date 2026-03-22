/**
 * Defines the Payload CMS collection configuration for scheduled ingests.
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

import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { User } from "@/payload-types";

import { createCommonConfig, createOwnershipAccess, isPrivileged } from "../shared-fields";
import { coreFields } from "./fields/core-fields";
import { importConfigFields } from "./fields/ingest-config-fields";
import { runtimeFields } from "./fields/runtime-fields";
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
  Boolean(context?.skipQuotaChecks ?? req.context?.skipQuotaChecks);

// Helper to check active schedules quota
const checkActiveSchedulesQuota = async (
  user: User,
  quotaService: ReturnType<typeof createQuotaService>
): Promise<void> => {
  const quotaCheck = await quotaService.checkQuota(user, "ACTIVE_SCHEDULES", 1);
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

  const quotaService = createQuotaService(req.payload);

  // Handle update operations (enabling a disabled schedule)
  if (isUpdate && isEnablingSchedule(originalDoc, data)) {
    await checkActiveSchedulesQuota(req.user!, quotaService);
    // Note: Actual increment happens in afterChange hook to avoid nested Payload operations
    return data;
  }

  // Handle new schedule creation (enabled by default)
  if (isCreate && data?.enabled !== false) {
    await checkActiveSchedulesQuota(req.user!, quotaService);
  }

  return data;
};

// Helper to validate catalog access
const validateCatalogAccess = async (data: unknown, req: PayloadRequest): Promise<void> => {
  const typedData = data as Record<string, unknown> | undefined;
  if (!typedData?.catalog || !req.user) return;

  const catalogId = extractRelationId(typedData.catalog as { id: string | number } | string | number);

  try {
    const catalog = await req.payload.findByID({
      collection: "catalogs",
      id: catalogId as string | number,
      overrideAccess: true,
    });

    if (catalog.createdBy) {
      const createdById = extractRelationId(catalog.createdBy);
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

const trackScheduleQuotaUsage = async (
  req: PayloadRequest,
  ownerId: string | number,
  operation: "create" | "update",
  doc: Record<string, unknown>,
  previousDoc?: Record<string, unknown>
): Promise<void> => {
  const quotaService = createQuotaService(req.payload);

  if (operation === "create" && doc.enabled !== false) {
    await quotaService.incrementUsage(ownerId, "ACTIVE_SCHEDULES", 1, req);
    return;
  }

  if (operation !== "update" || !previousDoc) return;

  const wasEnabled = previousDoc.enabled;
  const isEnabled = doc.enabled;

  if (!wasEnabled && isEnabled) {
    await quotaService.incrementUsage(ownerId, "ACTIVE_SCHEDULES", 1, req);
  } else if (wasEnabled && !isEnabled) {
    await quotaService.decrementUsage(ownerId, "ACTIVE_SCHEDULES", 1, req);
  }
};

const isAdminModifyingOtherUser = (
  operation: "create" | "update",
  req: { user?: User | null },
  ownerId: string | number | null | undefined
): boolean => operation === "update" && !!req.user && !!ownerId && req.user.id !== ownerId && req.user.role === "admin";

const auditAdminModification = async (
  req: PayloadRequest,
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
  ownerId: number
): Promise<void> => {
  try {
    const owner = await req.payload.findByID({ collection: "users", id: ownerId, overrideAccess: true, depth: 0 });
    await auditLog(req.payload, {
      action: AUDIT_ACTIONS.SCHEDULED_INGEST_ADMIN_MODIFIED,
      userId: ownerId,
      userEmail: owner.email,
      performedBy: req.user!.id,
      details: {
        scheduledIngestId: doc.id,
        scheduledIngestName: doc.name,
        enabledChanged: previousDoc?.enabled !== doc.enabled,
        newEnabled: doc.enabled,
      },
    });
  } catch {
    /* audit is best-effort */
  }
};

const ScheduledIngests: CollectionConfig = {
  slug: "scheduled-ingests",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "sourceUrl", "enabled", "nextRun", "lastRun", "updatedAt"],
    group: "Import",
    description: "Manage scheduled URL imports that run automatically",
    components: { beforeList: ["/components/admin/scheduled-ingests-banner"] },
  },
  access: {
    // Users can only read their own scheduled ingests, editors and admins can read all
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }): boolean | { createdBy: { equals: string | number } } => {
      if (!user) return false;
      if (isPrivileged(user)) return true;

      return { createdBy: { equals: user.id } };
    },

    // Anyone authenticated can create, but createdBy will be set automatically
    // Quota check moved to beforeChange hook to avoid deadlock
    create: async ({ req: { user, payload } }) => {
      if (!user) return false;

      // Check feature flag - even admins can't create if disabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      // eslint-disable-next-line @typescript-eslint/return-await -- Returning awaited promise is intentional for async access control
      return await isFeatureEnabled(payload, "enableScheduledIngests");
    },

    // Users can only update their own scheduled ingests, editors and admins can update all
    update: createOwnershipAccess("scheduled-ingests"),

    // Users can delete their own, editors and admins can delete any
    delete: createOwnershipAccess("scheduled-ingests"),

    // Only owners, editors, or admins can read version history
    readVersions: createOwnershipAccess("scheduled-ingests"),
  },
  fields: [...coreFields, ...importConfigFields, ...runtimeFields],
  hooks: {
    beforeChange: [
      beforeChangeHook,
      handleScheduleQuotaTracking, // This already handles quota checks
    ],
    afterChange: [
      async ({ doc, operation, req, previousDoc }) => {
        const ownerId = extractRelationId(doc.createdBy);

        if (ownerId) {
          await trackScheduleQuotaUsage(req, ownerId, operation, doc, previousDoc);
        }

        if (ownerId && isAdminModifyingOtherUser(operation, req, ownerId)) {
          await auditAdminModification(req, doc, previousDoc, ownerId);
        }

        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Decrement usage for the schedule owner when deleted
        const ownerId = extractRelationId(doc.createdBy);
        if (ownerId && doc.enabled) {
          const quotaService = createQuotaService(req.payload);
          await quotaService.decrementUsage(ownerId, "ACTIVE_SCHEDULES", 1, req);
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

export default ScheduledIngests;
