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
  // Disable versioning for users to avoid session clearing issues during user updates
  ...createCommonConfig({ versions: false, drafts: false }),
  auth: {
    // Enable email verification using Payload's built-in feature
    // This auto-adds _verified and _verificationToken fields
    verify: {
      generateEmailHTML: (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const verifyUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/verify-email?token=${token}`;
        return `
          <!DOCTYPE html>
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h1>Verify your TimeTiles account</h1>
              <p>Hello${firstName ? ` ${firstName}` : ""},</p>
              <p>Thank you for registering with TimeTiles. Please verify your email address by clicking the link below:</p>
              <p style="margin: 20px 0;">
                <a href="${verifyUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                  Verify Email
                </a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p><a href="${verifyUrl}">${verifyUrl}</a></p>
              <p>This link will expire in 24 hours.</p>
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </body>
          </html>
        `;
      },
      generateEmailSubject: () => {
        return "Verify your TimeTiles account";
      },
    },
    // Configure forgot password emails
    forgotPassword: {
      generateEmailHTML: (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const resetUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/reset-password?token=${token}`;
        return `
          <!DOCTYPE html>
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h1>Reset your password</h1>
              <p>Hello${firstName ? ` ${firstName}` : ""},</p>
              <p>You requested to reset your password. Click the link below to set a new password:</p>
              <p style="margin: 20px 0;">
                <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                  Reset Password
                </a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request a password reset, you can safely ignore this email.</p>
            </body>
          </html>
        `;
      },
      generateEmailSubject: () => {
        return "Reset your TimeTiles password";
      },
    },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "firstName", "lastName", "role", "trustLevel", "isActive"],
  },
  access: {
    // Users can read their own profile, admins can read all
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }): boolean | { id: { equals: string | number } } => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return { id: { equals: user.id } };
    },

    // Allow self-registration for unauthenticated users
    // Security: beforeChange hook forces role='user' and trustLevel='BASIC' for self-registrants
    // Admins can always create, unauthenticated can self-register, authenticated non-admins cannot
    create: ({ req: { user } }) => user?.role === "admin" || !user,

    // Users can update their own profile (except role), admins can update anyone
    // eslint-disable-next-line sonarjs/function-return-type
    update: ({ req: { user }, data }): boolean | { id: { equals: string | number } } => {
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
    {
      name: "registrationSource",
      type: "select",
      options: [
        { label: "Admin Created", value: "admin" },
        { label: "Self-Registration", value: "self" },
      ],
      defaultValue: "admin",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "How this user account was created",
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
    // Note: usage tracking has been moved to the separate 'user-usage' collection
    // to avoid session-clearing issues when updating user records
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
      ({ data, operation, req, originalDoc }) => {
        // SECURITY: Handle self-registration (unauthenticated user creation)
        // Force safe defaults to prevent privilege escalation
        //
        // We check req.payloadAPI === "REST" to distinguish between:
        // - Public API requests (REST): Users self-registering via HTTP endpoints
        // - Local API calls (payload.create()): Tests, seeding scripts, system operations
        //
        // Only public API self-registration should be restricted. Local API calls
        // (which have req.payloadAPI === "local" or undefined) need to create
        // admin users for testing and seeding purposes.
        const isPublicApiRequest = req.payloadAPI === "REST";
        if (operation === "create" && !req.user && isPublicApiRequest) {
          // Force user role - prevent self-registrants from becoming admin/editor
          data.role = "user";
          // Force BASIC trust level - lowest quotas for new self-registered users
          data.trustLevel = String(TRUST_LEVELS.BASIC);
          // Mark as self-registered
          data.registrationSource = "self";
          // Ensure account is active
          data.isActive = true;
        }

        // Auto-set quotas based on trust level ONLY when trust level actually changes
        if (operation === "update" && data?.trustLevel !== undefined && originalDoc?.trustLevel !== data.trustLevel) {
          const trustLevel = Number(data.trustLevel);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];

          if (defaultQuotas && !data.customQuotas) {
            // Merge with defaults, filtering out undefined values from Payload's group initialization
            const providedQuotas = data.quotas || {};
            const filteredProvidedQuotas: Record<string, number> = {};

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

        // Initialize quotas on user creation
        // Note: usage tracking is handled via user-usage collection (created in afterChange hook)
        if (operation === "create") {
          const trustLevel = Number(data?.trustLevel || TRUST_LEVELS.REGULAR);
          const defaultQuotas = DEFAULT_QUOTAS[trustLevel as keyof typeof DEFAULT_QUOTAS];

          // Merge with defaults, filtering out undefined values from Payload's group initialization
          // Payload initializes group fields with all fields set to undefined
          const providedQuotas = data.quotas || {};
          const filteredProvidedQuotas: Record<string, number> = {};

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

        return data;
      },
    ],
    // Note: User-usage records are created lazily via QuotaService.getOrCreateUsageRecord()
    // on first quota check. This avoids FK constraint issues that occur when trying to
    // create them in afterChange hooks (the user transaction hasn't committed yet).
    afterChange: [],
  },
};

export default Users;
