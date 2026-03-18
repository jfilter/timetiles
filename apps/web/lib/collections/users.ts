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
  normalizeTrustLevel,
  TRUST_LEVEL_DESCRIPTIONS,
  TRUST_LEVEL_LABELS,
  TRUST_LEVELS,
} from "@/lib/constants/quota-constants";
import { getEmailBranding } from "@/lib/email/branding";
import { getEmailTranslations } from "@/lib/email/i18n";
import { emailButton, emailLayout, greeting } from "@/lib/email/layout";
import { AUDIT_ACTIONS, auditFieldChanges, auditLog } from "@/lib/services/audit-log-service";

import { createCommonConfig } from "./shared-fields";

const filterDefinedQuotas = (quotas: Record<string, unknown> | undefined): Record<string, number> => {
  const filtered: Record<string, number> = {};
  if (!quotas) return filtered;
  for (const key in quotas) {
    if (quotas[key] !== undefined) {
      filtered[key] = quotas[key] as number;
    }
  }
  return filtered;
};

const initializeQuotasFromTrustLevel = (
  data: Record<string, unknown>,
  trustLevel: string | number | null | undefined
): void => {
  const normalized = normalizeTrustLevel(trustLevel);
  const defaultQuotas = DEFAULT_QUOTAS[normalized];
  const filteredProvidedQuotas = filterDefinedQuotas(data.quotas as Record<string, unknown> | undefined);
  data.quotas = { ...defaultQuotas, ...filteredProvidedQuotas };
};

const Users: CollectionConfig = {
  slug: "users",
  // Disable versioning for users to avoid session clearing issues during user updates
  ...createCommonConfig({ versions: false, drafts: false }),
  auth: {
    // Enable email verification using Payload's built-in feature
    // This auto-adds _verified and _verificationToken fields
    // Payload v3 does not expire verification tokens natively (no beforeOperation
    // hook for verifyEmail). Tokens remain valid until used. To add expiry, a custom
    // API route wrapping /api/users/verify/:token would be needed.
    verify: {
      generateEmailHTML: async (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const payload = args?.req?.payload;
        const branding = payload ? await getEmailBranding(payload) : { siteName: "TimeTiles", logoUrl: null };
        const t = getEmailTranslations(user?.locale, { siteName: branding.siteName });
        const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
        const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
        return emailLayout(
          `
          <h1>${t("verifyAccountTitle")}</h1>
          ${greeting(t, firstName)}
          <p>${t("verifyAccountBody")}</p>
          ${emailButton(verifyUrl, t("verifyEmailBtn"))}
          <p>${t("orCopyLink")}</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>${t("verifyAccountIgnore")}</p>
        `,
          t,
          branding.logoUrl
        );
      },
      generateEmailSubject: (args) => {
        const t = getEmailTranslations(args?.user?.locale, { siteName: "TimeTiles" });
        return t("verifyAccountSubject");
      },
    },
    // Configure forgot password emails
    forgotPassword: {
      generateEmailHTML: async (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const payload = args?.req?.payload;
        const branding = payload ? await getEmailBranding(payload) : { siteName: "TimeTiles", logoUrl: null };
        const t = getEmailTranslations(user?.locale, { siteName: branding.siteName });
        const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        return emailLayout(
          `
          <h1>${t("resetPasswordTitle")}</h1>
          ${greeting(t, firstName)}
          <p>${t("resetPasswordBody")}</p>
          ${emailButton(resetUrl, t("resetPasswordBtn"))}
          <p>${t("orCopyLink")}</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>${t("resetPasswordExpiry")}</p>
          <p>${t("resetPasswordIgnore")}</p>
        `,
          t,
          branding.logoUrl
        );
      },
      generateEmailSubject: (args) => {
        const t = getEmailTranslations(args?.user?.locale, { siteName: "TimeTiles" });
        return t("resetPasswordSubject");
      },
    },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "firstName", "lastName", "role", "trustLevel", "isActive"],
    group: "System",
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

    // Users can update their own profile, admins can update anyone
    // Role changes are prevented via field-level access control on the role field
    // eslint-disable-next-line sonarjs/function-return-type
    update: ({ req: { user } }): boolean | { id: { equals: string | number } } => {
      if (!user) return false;
      if (user.role === "admin") return true;
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
    { name: "firstName", type: "text", maxLength: 100 },
    { name: "lastName", type: "text", maxLength: 100 },
    {
      name: "role",
      type: "select",
      options: [
        { label: "User", value: "user" },
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
      defaultValue: "user",
      access: { update: ({ req: { user } }) => user?.role === "admin" },
      admin: { position: "sidebar" },
    },
    { name: "isActive", type: "checkbox", defaultValue: true, admin: { position: "sidebar" } },
    {
      name: "lastLoginAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" }, position: "sidebar", readOnly: true },
    },
    {
      name: "registrationSource",
      type: "select",
      options: [
        { label: "Admin Created", value: "admin" },
        { label: "Self-Registration", value: "self" },
      ],
      defaultValue: "admin",
      admin: { position: "sidebar", readOnly: true, description: "How this user account was created" },
    },
    {
      name: "locale",
      type: "select",
      options: [
        { label: "English", value: "en" },
        { label: "Deutsch", value: "de" },
      ],
      defaultValue: "en",
      admin: { position: "sidebar", description: "Preferred language for email notifications" },
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
      admin: { position: "sidebar", description: "User trust level determines resource quotas and rate limits" },
      access: { update: ({ req: { user } }) => user?.role === "admin" },
    },
    {
      name: "quotas",
      type: "group",
      admin: { description: "Resource quotas for this user (automatically set based on trust level)" },
      access: { update: ({ req: { user } }) => user?.role === "admin" },
      fields: [
        {
          name: "maxActiveSchedules",
          type: "number",
          min: -1,
          admin: { description: "Maximum number of active scheduled imports (-1 for unlimited)" },
        },
        {
          name: "maxUrlFetchesPerDay",
          type: "number",
          min: -1,
          admin: { description: "Maximum URL fetches per day (-1 for unlimited)" },
        },
        {
          name: "maxFileUploadsPerDay",
          type: "number",
          min: -1,
          admin: { description: "Maximum file uploads per day (-1 for unlimited)" },
        },
        {
          name: "maxEventsPerImport",
          type: "number",
          min: -1,
          admin: { description: "Maximum events per single import (-1 for unlimited)" },
        },
        {
          name: "maxTotalEvents",
          type: "number",
          min: -1,
          admin: { description: "Maximum total events allowed (-1 for unlimited)" },
        },
        {
          name: "maxImportJobsPerDay",
          type: "number",
          min: -1,
          admin: { description: "Maximum import jobs per day (-1 for unlimited)" },
        },
        {
          name: "maxFileSizeMB",
          type: "number",
          min: 1,
          admin: { description: "Maximum file size in MB for uploads" },
        },
        {
          name: "maxCatalogsPerUser",
          type: "number",
          min: -1,
          admin: { description: "Maximum number of catalogs per user (-1 for unlimited)" },
        },
        {
          name: "maxScraperRepos",
          type: "number",
          min: -1,
          admin: { description: "Maximum number of scraper repos (-1 for unlimited)" },
        },
        {
          name: "maxScraperRunsPerDay",
          type: "number",
          min: -1,
          admin: { description: "Maximum scraper runs per day (-1 for unlimited)" },
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
        read: ({ req: { user } }) => user?.role === "admin",
        update: ({ req: { user } }) => user?.role === "admin",
      },
    },
    // Account Deletion Fields
    {
      name: "deletionStatus",
      type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Pending Deletion", value: "pending_deletion" },
        { label: "Deleted", value: "deleted" },
      ],
      defaultValue: "active",
      admin: { position: "sidebar", description: "Account deletion status" },
    },
    {
      name: "deletionRequestedAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        position: "sidebar",
        readOnly: true,
        description: "When the user requested account deletion",
      },
    },
    {
      name: "deletionScheduledAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        position: "sidebar",
        readOnly: true,
        description: "When the account will be permanently deleted",
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
        const isTrustLevelChange =
          operation === "update" && data?.trustLevel !== undefined && originalDoc?.trustLevel !== data.trustLevel;
        if (isTrustLevelChange && DEFAULT_QUOTAS[normalizeTrustLevel(data.trustLevel)] && !data.customQuotas) {
          initializeQuotasFromTrustLevel(data, data.trustLevel);
        }

        // Initialize quotas on user creation
        if (operation === "create") {
          initializeQuotasFromTrustLevel(data, data?.trustLevel);
        }

        return data;
      },
    ],
    // Note: User-usage records are created lazily via QuotaService.getOrCreateUsageRecord()
    // on first quota check. This avoids FK constraint issues that occur when trying to
    // create them in afterChange hooks (the user transaction hasn't committed yet).
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== "update" || !previousDoc) return doc;

        const targetUserId = doc.id;
        const performedBy = req.user?.id === targetUserId ? undefined : req.user?.id;

        // Audit trust level, role, and custom quota changes
        await auditFieldChanges(
          req.payload,
          {
            previousDoc: previousDoc as Record<string, unknown>,
            doc: doc as unknown as Record<string, unknown>,
            userId: targetUserId,
            userEmail: doc.email,
            performedBy,
          },
          [
            {
              action: AUDIT_ACTIONS.TRUST_LEVEL_CHANGED,
              fieldPath: "trustLevel",
              detailsFn: (oldVal, newVal) => ({ previousTrustLevel: oldVal, newTrustLevel: newVal }),
            },
            {
              action: AUDIT_ACTIONS.ROLE_CHANGED,
              fieldPath: "role",
              detailsFn: (oldVal, newVal) => ({ previousRole: oldVal, newRole: newVal }),
            },
            { action: AUDIT_ACTIONS.CUSTOM_QUOTAS_CHANGED, fieldPath: "customQuotas" },
          ]
        );

        // Audit isActive as separate activate/deactivate actions
        if (previousDoc.isActive !== doc.isActive) {
          const action = doc.isActive ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED;
          await auditLog(req.payload, {
            action,
            userId: targetUserId,
            userEmail: doc.email,
            performedBy,
            details: { previousValue: previousDoc.isActive, newValue: doc.isActive },
          });
        }

        // Audit manual quota overrides (quotas changed WITHOUT trust level change)
        if (
          previousDoc.trustLevel === doc.trustLevel &&
          JSON.stringify(previousDoc.quotas) !== JSON.stringify(doc.quotas)
        ) {
          await auditLog(req.payload, {
            action: AUDIT_ACTIONS.QUOTA_OVERRIDDEN,
            userId: targetUserId,
            userEmail: doc.email,
            performedBy,
            details: { previousQuotas: previousDoc.quotas, newQuotas: doc.quotas },
          });
        }

        return doc;
      },
    ],
  },
};

export default Users;
