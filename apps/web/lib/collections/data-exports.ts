/**
 * Collection for tracking user data export requests.
 *
 * Each record represents a user's request to export their data and tracks
 * the status from pending through to completion, expiry, or failure.
 * The actual export files are stored on disk and referenced via filePath.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

const DataExports: CollectionConfig = {
  slug: "data-exports",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["user", "status", "requestedAt", "expiresAt", "fileSize"],
    group: "System",
    description: "User data export requests and their status",
  },
  access: {
    // Users can only read their own exports, admins can read all
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }) => {
      if (!user) {
        return false;
      }
      if (user.role === "admin") {
        return true;
      }
      return { user: { equals: user.id } };
    },
    // Created only via API/job, not directly by users
    create: ({ req: { user } }) => Boolean(user?.role === "admin"),
    // Updated only by system/job
    update: ({ req: { user } }) => Boolean(user?.role === "admin"),
    // Only admins can delete
    delete: ({ req: { user } }) => Boolean(user?.role === "admin"),
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
      admin: {
        description: "User who requested the export",
        readOnly: true,
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Ready", value: "ready" },
        { label: "Failed", value: "failed" },
        { label: "Expired", value: "expired" },
      ],
      admin: {
        position: "sidebar",
        description: "Current status of the export request",
      },
    },
    {
      name: "requestedAt",
      type: "date",
      required: true,
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        readOnly: true,
        description: "When the export was requested",
      },
    },
    {
      name: "completedAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description: "When the export finished processing",
        condition: (data) => data.status === "ready" || data.status === "failed",
      },
    },
    {
      name: "expiresAt",
      type: "date",
      index: true,
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description: "When the download link expires (7 days after completion)",
      },
    },
    {
      name: "filePath",
      type: "text",
      admin: {
        description: "Internal file path for the export ZIP (for cleanup)",
        condition: () => false, // Hidden from admin UI
      },
    },
    {
      name: "fileSize",
      type: "number",
      admin: {
        description: "File size in bytes",
        readOnly: true,
      },
    },
    {
      name: "downloadCount",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Number of times the export has been downloaded",
        readOnly: true,
      },
    },
    {
      name: "summary",
      type: "json",
      admin: {
        description: "Export summary with record counts",
        readOnly: true,
      },
    },
    {
      name: "errorLog",
      type: "textarea",
      admin: {
        description: "Error details if export failed",
        condition: (data) => data.status === "failed",
        readOnly: true,
      },
    },
  ],
};

export default DataExports;
