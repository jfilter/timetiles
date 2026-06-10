/**
 * Import configuration fields for scheduled ingests.
 *
 * Combines schema configuration and authentication fields that control
 * how the scheduled ingest handles data detection, validation, and
 * secure access to the source URL.
 *
 * Sensitive credential fields (apiKey, bearerToken, password) are encrypted
 * at rest using AES-256-GCM via Payload field hooks. Encryption is transparent
 * to all consumers — values are decrypted on read and encrypted on write.
 *
 * @module
 * @category Collections
 */

import type { Field, FieldAccess, FieldHook } from "payload";

import { getEnv } from "@/lib/config/env";
import { validateCustomHeaders } from "@/lib/ingest/validate-custom-headers";
import { decryptField, encryptField, isEncrypted } from "@/lib/security/encryption";
import { extractRelationId } from "@/lib/utils/relation-id";

// ---------------------------------------------------------------------------
// Schema configuration fields
// ---------------------------------------------------------------------------

const schemaConfigFields: Field[] = [
  {
    name: "schemaMode",
    type: "select",
    defaultValue: "additive",
    options: [
      { label: "Strict - Schema must match exactly", value: "strict" },
      { label: "Additive - Accept new fields automatically", value: "additive" },
      { label: "Flexible - Require approval for changes", value: "flexible" },
    ],
    admin: {
      description:
        "How to handle schema changes during scheduled executions. " +
        "Strict: fail if schema differs. " +
        "Additive: auto-accept new fields. " +
        "Flexible: require approval for changes.",
    },
  },
  {
    name: "sourceIngestFile",
    type: "relationship",
    relationTo: "ingest-files",
    admin: { readOnly: true, description: "The original ingest file this schedule was created from (via wizard)" },
  },
];

// ---------------------------------------------------------------------------
// Authentication fields — encrypted credentials for URL access
// ---------------------------------------------------------------------------

const getSecret = (): string => {
  const secret = getEnv().PAYLOAD_SECRET;
  if (!secret) {
    throw new Error("PAYLOAD_SECRET is required for credential encryption");
  }
  return secret;
};

/** Encrypt a field value before writing to the database. */
const encryptBeforeChange: FieldHook = ({ value }) => {
  if (!value || typeof value !== "string") return value;
  if (isEncrypted(value)) return value;
  return encryptField(value, getSecret());
};

/** Decrypt a field value after reading from the database. */
const decryptAfterRead: FieldHook = ({ value }) => {
  if (!value || typeof value !== "string") return value;
  if (!isEncrypted(value)) return value;
  return decryptField(value, getSecret());
};

const credentialHooks = { beforeChange: [encryptBeforeChange], afterRead: [decryptAfterRead] };

/**
 * Field-level read guard for decrypted credentials.
 *
 * The collection's read access lets privileged users (editors + admins) read
 * EVERY schedule, and `decryptAfterRead` decrypts these fields for whoever reads
 * them — so without this guard an editor could read every other user's plaintext
 * API key / bearer token / password. Restrict the decrypted value to the
 * schedule owner (`createdBy`) and admins. The ingest pipeline reads via
 * `asSystem`/`overrideAccess`, which bypasses field-level access, so runtime
 * credential fetching is unaffected.
 */
const canReadCredential: FieldAccess = ({ req: { user }, doc }) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const ownerId = extractRelationId(
    (doc as { createdBy?: { id: string | number } | string | number } | undefined)?.createdBy
  );
  return ownerId != null && String(ownerId) === String(user.id);
};

const credentialAccess = { read: canReadCredential };

const authFields: Field[] = [
  {
    name: "authConfig",
    type: "group",
    admin: { description: "Authentication configuration for accessing the URL" },
    fields: [
      {
        name: "type",
        type: "select",
        options: [
          { label: "None", value: "none" },
          { label: "API Key (Header)", value: "api-key" },
          { label: "Bearer Token", value: "bearer" },
          { label: "Basic Auth", value: "basic" },
          { label: "OAuth 2.0 (Password Grant)", value: "oauth" },
        ],
        defaultValue: "none",
      },
      {
        name: "apiKey",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "api-key",
          description: "API key to include in request header",
        },
        hooks: credentialHooks,
        access: credentialAccess,
      },
      {
        name: "apiKeyHeader",
        type: "text",
        defaultValue: "X-API-Key",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "api-key",
          description: "Header name for API key",
        },
      },
      {
        name: "bearerToken",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "bearer",
          description: "Bearer token for Authorization header",
        },
        hooks: credentialHooks,
        access: credentialAccess,
      },
      {
        name: "tokenUrl",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "oauth",
          description: "OAuth token endpoint URL",
          placeholder: "https://example.com/oauth/token",
        },
      },
      {
        name: "clientId",
        type: "text",
        admin: { condition: (_, siblingData) => siblingData?.type === "oauth", description: "OAuth client ID" },
      },
      {
        name: "username",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "basic" || siblingData?.type === "oauth",
          description: "Username / email for authentication",
        },
      },
      {
        name: "password",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "basic" || siblingData?.type === "oauth",
          description: "Password for authentication",
        },
        hooks: credentialHooks,
        access: credentialAccess,
      },
      {
        name: "customHeaders",
        type: "json",
        admin: {
          description:
            "Additional custom headers as a JSON object. Header names and values are validated at save time (see customHeaders rules).",
        },
        validate: (value: unknown) => {
          const result = validateCustomHeaders(value);
          return result.ok ? true : (result.error ?? "Invalid customHeaders");
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const importConfigFields: Field[] = [...schemaConfigFields, ...authFields];
