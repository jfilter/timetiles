/**
 * Defines the Payload CMS collection for Deletion Audit Logs.
 *
 * This collection stores immutable records of account deletions for compliance
 * and security auditing purposes. Records cannot be edited or deleted by anyone,
 * ensuring a tamper-proof audit trail.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

const DeletionAuditLog: CollectionConfig = {
  slug: "deletion-audit-log",
  admin: {
    group: "System",
    useAsTitle: "deletedAt",
    defaultColumns: ["deletedUserId", "deletionType", "deletedAt", "deletedUserEmailHash"],
    description: "Immutable audit trail of account deletions",
  },
  access: {
    // Only admins can read audit logs
    read: ({ req: { user } }) => user?.role === "admin",
    // No one can create via API - only via internal service with overrideAccess
    create: () => false,
    // Immutable - no updates allowed
    update: () => false,
    // Immutable - no deletes allowed
    delete: () => false,
  },
  // Disable versioning for audit logs - they are immutable
  versions: false,
  timestamps: true,
  fields: [
    {
      name: "deletedUserId",
      type: "number",
      required: true,
      index: true,
      admin: {
        description: "The ID of the deleted user",
        readOnly: true,
      },
    },
    {
      name: "deletedUserEmailHash",
      type: "text",
      required: true,
      admin: {
        description: "SHA256 hash of the deleted user's email (for privacy)",
        readOnly: true,
      },
    },
    {
      name: "deletedAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the account was permanently deleted",
        readOnly: true,
      },
    },
    {
      name: "deletionRequestedAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the user requested deletion",
        readOnly: true,
      },
    },
    {
      name: "deletedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "User who initiated the deletion (null for self-deletion after grace period)",
        readOnly: true,
      },
    },
    {
      name: "deletionType",
      type: "select",
      required: true,
      options: [
        { label: "Self-Deletion", value: "self" },
        { label: "Admin Deletion", value: "admin" },
        { label: "Scheduled (Grace Period)", value: "scheduled" },
      ],
      admin: {
        description: "How the deletion was initiated",
        readOnly: true,
      },
    },
    {
      name: "reason",
      type: "text",
      admin: {
        description: "Optional reason for deletion (admin-initiated only)",
        readOnly: true,
      },
    },
    {
      name: "dataTransferred",
      type: "json",
      admin: {
        description: "Summary of public data transferred to system user",
        readOnly: true,
      },
    },
    {
      name: "dataDeleted",
      type: "json",
      admin: {
        description: "Summary of private data permanently deleted",
        readOnly: true,
      },
    },
    {
      name: "ipAddressHash",
      type: "text",
      admin: {
        description: "Hashed IP address of the requester (for security)",
        readOnly: true,
      },
    },
  ],
};

export default DeletionAuditLog;
