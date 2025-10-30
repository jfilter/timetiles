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

import {
  DEFAULT_QUOTAS,
  TRUST_LEVEL_DESCRIPTIONS,
  TRUST_LEVEL_LABELS,
  TRUST_LEVELS,
} from "@/lib/constants/quota-constants";

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
    // Users can read their own profile, admins can read all
    read: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return { id: { equals: user.id } };
    },

    // Only admins can create users
    // Note: For public registration, modify this to allow unauthenticated
    // creation but force role to 'user' via beforeChange hook
    create: ({ req: { user } }) => {
      return user?.role === "admin";
    },

    // Users can update their own profile (except role), admins can update anyone
    update: ({ req: { user }, data }) => {
      if (!user) return false;
      if (user.role === "admin") return true;

      // Prevent non-admins from changing roles
      if (data?.role && data.role !== user.role) {
        return false;
      }

      return { id: { equals: user.id } };
    },

    // Only admins can delete users
    delete: ({ req: { user } }) => {
      return user?.role === "admin";
    },

    // Only admins can read version history
    readVersions: ({ req: { user } }) => {
      return user?.role === "admin";
    },
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
          admin: {
            description: "Maximum number of active scheduled imports (-1 for unlimited)",
          },
        },
        {
          name: "maxUrlFetchesPerDay",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum URL fetches per day (-1 for unlimited)",
          },
        },
        {
          name: "maxFileUploadsPerDay",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum file uploads per day (-1 for unlimited)",
          },
        },
        {
          name: "maxEventsPerImport",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum events per single import (-1 for unlimited)",
          },
        },
        {
          name: "maxTotalEvents",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum total events allowed (-1 for unlimited)",
          },
        },
        {
          name: "maxImportJobsPerDay",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum import jobs per day (-1 for unlimited)",
          },
        },
        {
          name: "maxFileSizeMB",
          type: "number",
          min: 1,
          admin: {
            description: "Maximum file size in MB for uploads",
          },
        },
        {
          name: "maxCatalogsPerUser",
          type: "number",
          min: -1,
          admin: {
            description: "Maximum number of catalogs per user (-1 for unlimited)",
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
          admin: {
            description: "Currently active scheduled imports",
            readOnly: true,
          },
        },
        {
          name: "urlFetchesToday",
          type: "number",
          admin: {
            description: "URL fetches performed today",
            readOnly: true,
          },
        },
        {
          name: "fileUploadsToday",
          type: "number",
          admin: {
            description: "Files uploaded today",
            readOnly: true,
          },
        },
        {
          name: "importJobsToday",
          type: "number",
          admin: {
            description: "Import jobs created today",
            readOnly: true,
          },
        },
        {
          name: "totalEventsCreated",
          type: "number",
          admin: {
            description: "Total events created by this user",
            readOnly: true,
          },
        },
        {
          name: "currentCatalogs",
          type: "number",
          admin: {
            description: "Current number of catalogs owned by this user",
            readOnly: true,
          },
        },
        {
          name: "lastResetDate",
          type: "date",
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
      ({ data, operation, req: _req, originalDoc }) => {
        // Auto-set quotas based on trust level ONLY when trust level actually changes
        if (operation === "update" && data?.trustLevel !== undefined && originalDoc?.trustLevel !== data.trustLevel) {
          const trustLevel = Number(data.trustLevel);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];

          if (defaultQuotas && !data.customQuotas) {
            // Merge with defaults, filtering out undefined values from Payload's group initialization
            const providedQuotas = data.quotas || {};
            const filteredProvidedQuotas: Record<string, any> = {};

            for (const key in providedQuotas) {
              if (providedQuotas[key] !== undefined) {
                filteredProvidedQuotas[key] = providedQuotas[key];
              }
            }

            data.quotas = {
              ...defaultQuotas,
              ...filteredProvidedQuotas,
            };
          }
        }

        // Initialize quotas and usage on user creation
        if (operation === "create") {
          const trustLevel = Number(data?.trustLevel || TRUST_LEVELS.REGULAR);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];

          // Merge with defaults, filtering out undefined values from Payload's group initialization
          // Payload initializes group fields with all fields set to undefined
          const providedQuotas = data.quotas || {};
          const filteredProvidedQuotas: Record<string, any> = {};

          for (const key in providedQuotas) {
            if (providedQuotas[key] !== undefined) {
              filteredProvidedQuotas[key] = providedQuotas[key];
            }
          }

          data.quotas = {
            ...defaultQuotas,
            ...filteredProvidedQuotas,
          };

          // Initialize usage if not provided
          if (!data.usage) {
            data.usage = {
              currentActiveSchedules: 0,
              urlFetchesToday: 0,
              fileUploadsToday: 0,
              importJobsToday: 0,
              totalEventsCreated: 0,
              currentCatalogs: 0,
              lastResetDate: new Date().toISOString(),
            };
          }
        }

        return data;
      },
    ],
  },
};

export default Users;
