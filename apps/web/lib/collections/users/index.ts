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

import { getEmailBranding } from "@/lib/email/branding";
import { getEmailTranslations } from "@/lib/email/i18n";
import { buildAccountVerificationEmailHtml, buildResetPasswordEmailHtml } from "@/lib/email/templates";
import { getBaseUrl } from "@/lib/utils/base-url";

import { createCommonConfig } from "../shared-fields";
import { usersFields } from "./fields";
import { usersAfterChangeHook, usersAfterErrorHook, usersAfterLoginHook, usersBeforeChangeHook } from "./hooks";

const Users: CollectionConfig = {
  slug: "users",
  // Disable versioning for users to avoid session clearing issues during user updates
  ...createCommonConfig({ versions: false, drafts: false }),
  auth: {
    useAPIKey: true,
    // Enable email verification token generation and direct-email fallback
    // This auto-adds _verified and _verificationToken fields
    //
    // TTL: Payload v3 does not expire verification tokens natively (no
    // beforeOperation hook for verifyEmail). We store `_verificationTokenExpiresAt`
    // alongside the token (set in the beforeChange hook below) and enforce a
    // 24-hour TTL in the custom `/api/users/verify/[token]` route, which gates
    // access to the built-in `payload.verifyEmail()` call.
    verify: {
      generateEmailHTML: async (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const payload = args?.req?.payload;
        const branding = payload ? await getEmailBranding(payload) : { siteName: "TimeTiles", logoUrl: null };
        const baseUrl = getBaseUrl();
        const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

        return buildAccountVerificationEmailHtml(verifyUrl, firstName, user?.locale, branding);
      },
      generateEmailSubject: (args) => {
        const t = getEmailTranslations(args?.user?.locale, { siteName: "TimeTiles" });
        return t("verifyAccountSubject");
      },
    },
    // Configure direct-email fallback for forgot password
    forgotPassword: {
      generateEmailHTML: async (args) => {
        const token = args?.token ?? "";
        const user = args?.user;
        const firstName = user?.firstName ?? "";
        const payload = args?.req?.payload;
        const branding = payload ? await getEmailBranding(payload) : { siteName: "TimeTiles", logoUrl: null };
        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        return buildResetPasswordEmailHtml(resetUrl, firstName, user?.locale, branding);
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
  fields: usersFields,
  hooks: {
    beforeChange: usersBeforeChangeHook,
    // Note: User-usage records are created lazily via QuotaService.getOrCreateUsageRecord()
    // on first quota check. This avoids FK constraint issues that occur when trying to
    // create them in afterChange hooks (the user transaction hasn't committed yet).
    afterChange: usersAfterChangeHook,
    afterLogin: usersAfterLoginHook,
    afterError: usersAfterErrorHook,
  },
};

export default Users;
