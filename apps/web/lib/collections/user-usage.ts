/**
 * Defines the Payload CMS collection for User Usage tracking.
 *
 * This collection stores usage counters separate from user authentication data
 * to avoid side effects with sessions and reduce overhead of usage tracking.
 * One-to-one relationship with users collection.
 *
 * Background: When usage counters were embedded in the users collection and versioning
 * was enabled, calling payload.update() on user documents would trigger session clearing
 * due to PostgreSQL cascade constraints on the users_sessions table. Separating usage
 * tracking into its own collection eliminates this risk entirely.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "./shared-fields";

const UserUsage: CollectionConfig = {
  slug: "user-usage",
  // Disable versioning - usage data doesn't need history and we want
  // to avoid any potential cascade issues with frequent updates
  ...createCommonConfig({ versions: false, drafts: false }),
  admin: {
    useAsTitle: "id",
    defaultColumns: ["user", "fileUploadsToday", "urlFetchesToday", "lastResetDate"],
    group: "System",
    // Hidden from admin navigation - managed programmatically
    hidden: true,
  },
  access: {
    // Only admins can read usage data in admin panel
    read: ({ req: { user } }) => user?.role === "admin",
    // Never create directly - created automatically with user via hook
    create: () => false,
    // Only system/admin can update usage data
    update: ({ req: { user } }) => user?.role === "admin",
    // Only admin can delete (cascades when user is deleted via FK)
    delete: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "The user this usage record belongs to",
      },
    },
    // Daily counters (reset at midnight UTC)
    {
      name: "urlFetchesToday",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "URL fetches performed today (resets at midnight UTC)",
      },
    },
    {
      name: "fileUploadsToday",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Files uploaded today (resets at midnight UTC)",
      },
    },
    {
      name: "importJobsToday",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Import jobs created today (resets at midnight UTC)",
      },
    },
    // Cumulative/current counters (never automatically reset)
    {
      name: "currentActiveSchedules",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Currently active scheduled imports",
      },
    },
    {
      name: "totalEventsCreated",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Total events created by this user (lifetime)",
      },
    },
    {
      name: "currentCatalogs",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Current number of catalogs owned by this user",
      },
    },
    // Reset tracking
    {
      name: "lastResetDate",
      type: "date",
      index: true,
      admin: {
        description: "Last time daily counters were reset",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
  ],
};

export default UserUsage;
