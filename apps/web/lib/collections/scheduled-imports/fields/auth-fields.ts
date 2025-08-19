/**
 * Authentication field definitions for scheduled imports.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

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
