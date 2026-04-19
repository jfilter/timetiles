/**
 * Field definitions for the Users collection.
 *
 * @module
 */
import type { Field } from "payload";

import { TRUST_LEVEL_DESCRIPTIONS, TRUST_LEVEL_LABELS, TRUST_LEVELS } from "@/lib/constants/quota-constants";

export const usersFields: Field[] = [
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
        admin: { description: "Maximum number of active scheduled ingests (-1 for unlimited)" },
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
        name: "maxIngestJobsPerDay",
        type: "number",
        min: -1,
        admin: { description: "Maximum import jobs per day (-1 for unlimited)" },
      },
      { name: "maxFileSizeMB", type: "number", min: 1, admin: { description: "Maximum file size in MB for uploads" } },
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
  // SECURITY: TTL marker for email verification tokens (24h).
  // Locked down so external API callers cannot read or mutate it — only the
  // beforeChange hook (running with full access) sets it. The custom
  // `/api/users/verify/[token]` route checks this before delegating to
  // Payload's built-in verifyEmail.
  {
    name: "_verificationTokenExpiresAt",
    type: "date",
    admin: { hidden: true },
    access: { read: () => false, update: () => false, create: () => false },
  },
];
