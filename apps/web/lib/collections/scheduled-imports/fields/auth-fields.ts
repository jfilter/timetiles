/**
 * Authentication field definitions for scheduled imports.
 *
 * Sensitive credential fields (apiKey, bearerToken, password) are encrypted
 * at rest using AES-256-GCM via Payload field hooks. Encryption is transparent
 * to all consumers — values are decrypted on read and encrypted on write.
 *
 * @module
 * @category Collections
 */

import type { Field, FieldHook } from "payload";

import { decryptField, encryptField, isEncrypted } from "@/lib/utils/encryption";

const getSecret = (): string => {
  const secret = process.env.PAYLOAD_SECRET;
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

const credentialHooks = {
  beforeChange: [encryptBeforeChange],
  afterRead: [decryptAfterRead],
};

export const authFields: Field[] = [
  {
    name: "authConfig",
    type: "group",
    admin: {
      description: "Authentication configuration for accessing the URL",
    },
    fields: [
      {
        name: "type",
        type: "select",
        options: [
          { label: "None", value: "none" },
          { label: "API Key (Header)", value: "api-key" },
          { label: "Bearer Token", value: "bearer" },
          { label: "Basic Auth", value: "basic" },
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
      },
      {
        name: "username",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "basic",
          description: "Username for basic authentication",
        },
      },
      {
        name: "password",
        type: "text",
        admin: {
          condition: (_, siblingData) => siblingData?.type === "basic",
          description: "Password for basic authentication",
        },
        hooks: credentialHooks,
      },
      {
        name: "customHeaders",
        type: "json",
        admin: {
          description: "Additional custom headers as JSON object",
        },
      },
    ],
  },
];
