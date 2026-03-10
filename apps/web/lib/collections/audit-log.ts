/**
 * Defines the Payload CMS collection for Audit Logs.
 *
 * This collection stores immutable records of sensitive account actions for
 * compliance and security auditing. Records cannot be edited or deleted by
 * anyone, ensuring a tamper-proof audit trail.
 *
 * Tracked actions include email changes, password changes, account deletion
 * lifecycle events, and failed password verification attempts.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

const AuditLog: CollectionConfig = {
  slug: "audit-log",
  admin: {
    group: "System",
    useAsTitle: "action",
    defaultColumns: ["action", "userId", "timestamp", "userEmailHash"],
    description: "Immutable audit trail of sensitive account actions",
  },
  access: {
    // Only admins can read audit logs
    read: ({ req: { user } }) => user?.role === "admin",
    // No one can create via API - only via internal service with overrideAccess
    create: () => false,
    // Immutable - no updates allowed via API
    update: () => false,
    // Immutable - no deletes allowed
    delete: () => false,
  },
  // Disable versioning for audit logs - they are immutable
  versions: false,
  timestamps: true,
  fields: [
    {
      name: "action",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "The type of action (e.g. account.email_changed, account.deletion_executed)",
        readOnly: true,
      },
    },
    {
      name: "userId",
      type: "number",
      required: true,
      index: true,
      admin: {
        description: "The ID of the user this action pertains to",
        readOnly: true,
      },
    },
    {
      name: "userEmailHash",
      type: "text",
      required: true,
      admin: {
        description: "SHA-256 hash of the user's email at the time of the action",
        readOnly: true,
      },
    },
    {
      name: "performedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "Admin who initiated the action (null for self-initiated actions)",
        readOnly: true,
      },
    },
    {
      name: "timestamp",
      type: "date",
      required: true,
      index: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the action occurred",
        readOnly: true,
      },
    },
    {
      name: "ipAddress",
      type: "text",
      admin: {
        description: "Raw client IP address (cleared after 30 days by background job)",
        readOnly: true,
      },
    },
    {
      name: "ipAddressHash",
      type: "text",
      admin: {
        description: "SHA-256 hash of the client IP address (permanent, for long-term correlation)",
        readOnly: true,
      },
    },
    {
      name: "details",
      type: "json",
      admin: {
        description: "Action-specific structured data",
        readOnly: true,
      },
    },
  ],
};

export default AuditLog;
