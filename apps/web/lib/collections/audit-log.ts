/**
 * Defines the Payload CMS collection for Audit Logs.
 *
 * This collection records sensitive account actions for security auditing.
 * API clients cannot create, edit or delete records. Trusted internal services
 * use Payload's access override to append entries and clear expired raw IPs;
 * these access rules do not provide tamper-proof storage.
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
    description: "Audit trail of sensitive account actions; read-only to API and admin clients",
  },
  access: {
    // Only admins can read audit logs
    read: ({ req: { user } }) => user?.role === "admin",
    // No one can create via API - only via internal service with overrideAccess
    create: () => false,
    // No updates allowed via API; internal IP retention cleanup uses overrideAccess
    update: () => false,
    // No deletes allowed via API
    delete: () => false,
  },
  // Do not retain versions containing raw IPs after retention cleanup.
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
      admin: { description: "The ID of the user this action pertains to", readOnly: true },
    },
    {
      name: "userEmailHash",
      type: "text",
      required: true,
      admin: { description: "SHA-256 hash of the user's email at the time of the action", readOnly: true },
    },
    {
      name: "performedBy",
      type: "relationship",
      relationTo: "users",
      admin: { description: "Admin who initiated the action (null for self-initiated actions)", readOnly: true },
    },
    {
      name: "timestamp",
      type: "date",
      required: true,
      index: true,
      admin: { date: { pickerAppearance: "dayAndTime" }, description: "When the action occurred", readOnly: true },
    },
    {
      name: "ipAddress",
      type: "text",
      admin: { description: "Raw client IP address (cleared after 30 days by background job)", readOnly: true },
    },
    {
      name: "ipAddressHash",
      type: "text",
      admin: {
        description: "SHA-256 hash of the client IP address (permanent, for long-term correlation)",
        readOnly: true,
      },
    },
    { name: "details", type: "json", admin: { description: "Action-specific structured data", readOnly: true } },
  ],
};

export default AuditLog;
