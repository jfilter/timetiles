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

import type { CollectionConfig } from "payload";

import { createCommonConfig } from "../shared-fields";
import { authFields } from "./fields/auth-fields";
import { basicFields } from "./fields/basic-fields";
import { executionFields } from "./fields/execution-fields";
import { scheduleFields } from "./fields/schedule-fields";
import { targetFields } from "./fields/target-fields";
import { webhookFields } from "./fields/webhook-fields";
import { beforeChangeHook } from "./hooks";
import { validateCronExpression, validateUrl } from "./validation";

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
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => user?.role === "admin" || false,
  },
  fields: [...basicFields, ...authFields, ...targetFields, ...scheduleFields, ...webhookFields, ...executionFields],
  hooks: {
    beforeChange: [beforeChangeHook],
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
