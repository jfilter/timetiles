/**
 * Defines the Payload CMS collection configuration for Users.
 *
 * This is a standard user collection for authentication and authorization within the application.
 * It uses Payload's built-in authentication features and includes basic user profile fields
 * like first name, last name, and role. The role field is used to implement role-based
 * access control throughout the system.
 *
 * Additionally, this collection now includes a comprehensive permission and quota system
 * with trust levels, resource quotas, and usage tracking to control and monitor user
 * access to various system resources.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { TRUST_LEVELS, TRUST_LEVEL_LABELS, TRUST_LEVEL_DESCRIPTIONS } from "@/lib/constants/permission-constants";

import { createCommonConfig } from "./shared-fields";

const Users: CollectionConfig = {
  slug: "users",
  ...createCommonConfig(),
  auth: true,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "firstName", "lastName", "role", "trustLevel", "isActive"],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: "firstName",
      type: "text",
      maxLength: 100,
    },
    {
      name: "lastName",
      type: "text",
      maxLength: 100,
    },
    {
      name: "role",
      type: "select",
      options: [
        {
          label: "User",
          value: "user",
        },
        {
          label: "Admin",
          value: "admin",
        },
        {
          label: "Editor",
          value: "editor",
        },
      ],
      defaultValue: "user",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "lastLoginAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        position: "sidebar",
        readOnly: true,
      },
    },
    // Permission and Quota Fields
    {
      name: "trustLevel",
      type: "select",
      options: Object.entries(TRUST_LEVEL_LABELS).map(([value, label]) => ({
        label: `${label} - ${TRUST_LEVEL_DESCRIPTIONS[Number(value) as keyof typeof TRUST_LEVEL_DESCRIPTIONS]}`,
        value,
      })),
      defaultValue: String(TRUST_LEVELS.REGULAR),
      required: true,
      admin: {
        position: "sidebar",
        description: "User trust level determines resource quotas and rate limits",
      },
      access: {
        update: ({ req: { user } }) => user?.role === "admin",
      },
    },
    {
      name: "quotas",
      type: "group",
      admin: {
        description: "Resource quotas for this user (automatically set based on trust level)",
      },
      access: {
        update: ({ req: { user } }) => user?.role === "admin",
      },
      fields: [
        {
          name: "maxActiveSchedules",
          type: "number",
          min: -1,
          defaultValue: 5,
          admin: {
            description: "Maximum number of active scheduled imports (-1 for unlimited)",
          },
        },
        {
          name: "maxUrlFetchesPerDay",
          type: "number",
          min: -1,
          defaultValue: 20,
          admin: {
            description: "Maximum URL fetches per day (-1 for unlimited)",
          },
        },
        {
          name: "maxFileUploadsPerDay",
          type: "number",
          min: -1,
          defaultValue: 10,
          admin: {
            description: "Maximum file uploads per day (-1 for unlimited)",
          },
        },
        {
          name: "maxEventsPerImport",
          type: "number",
          min: -1,
          defaultValue: 10000,
          admin: {
            description: "Maximum events per single import (-1 for unlimited)",
          },
        },
        {
          name: "maxTotalEvents",
          type: "number",
          min: -1,
          defaultValue: 50000,
          admin: {
            description: "Maximum total events allowed (-1 for unlimited)",
          },
        },
        {
          name: "maxImportJobsPerDay",
          type: "number",
          min: -1,
          defaultValue: 20,
          admin: {
            description: "Maximum import jobs per day (-1 for unlimited)",
          },
        },
        {
          name: "maxFileSizeMB",
          type: "number",
          min: 1,
          defaultValue: 50,
          admin: {
            description: "Maximum file size in MB for uploads",
          },
        },
      ],
    },
    {
      name: "usage",
      type: "group",
      admin: {
        description: "Current resource usage tracking",
        readOnly: true,
      },
      fields: [
        {
          name: "currentActiveSchedules",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Currently active scheduled imports",
            readOnly: true,
          },
        },
        {
          name: "urlFetchesToday",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "URL fetches performed today",
            readOnly: true,
          },
        },
        {
          name: "fileUploadsToday",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Files uploaded today",
            readOnly: true,
          },
        },
        {
          name: "importJobsToday",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Import jobs created today",
            readOnly: true,
          },
        },
        {
          name: "totalEventsCreated",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Total events created by this user",
            readOnly: true,
          },
        },
        {
          name: "lastResetDate",
          type: "date",
          defaultValue: () => new Date().toISOString(),
          admin: {
            description: "Last time daily counters were reset",
            readOnly: true,
          },
        },
      ],
    },
    {
      name: "customQuotas",
      type: "json",
      admin: {
        description: "Custom quota overrides (JSON format) - overrides trust level defaults",
        condition: ({ data }) => data?.role === "admin",
      },
      access: {
        update: ({ req: { user } }) => user?.role === "admin",
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Auto-set quotas based on trust level when trust level changes
        if (operation === "update" && data?.trustLevel !== undefined) {
          const { DEFAULT_QUOTAS } = await import("@/lib/constants/permission-constants");
          const trustLevel = Number(data.trustLevel);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];
          
          if (defaultQuotas && !data.customQuotas) {
            data.quotas = defaultQuotas;
          }
        }

        // Initialize usage on user creation
        if (operation === "create") {
          const { DEFAULT_QUOTAS } = await import("@/lib/constants/permission-constants");
          const trustLevel = Number(data?.trustLevel || TRUST_LEVELS.REGULAR);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];
          
          data.quotas = data.quotas || defaultQuotas;
          data.usage = {
            currentActiveSchedules: 0,
            urlFetchesToday: 0,
            fileUploadsToday: 0,
            importJobsToday: 0,
            totalEventsCreated: 0,
            lastResetDate: new Date().toISOString(),
          };
        }

        return data;
      },
    ],
  },
};

export default Users;
