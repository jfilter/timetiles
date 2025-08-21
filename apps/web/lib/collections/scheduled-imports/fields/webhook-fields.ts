/**
 * Webhook configuration fields for scheduled imports.
 *
 * Provides fields for enabling webhook URLs that can trigger imports on-demand.
 * Includes secure token generation and URL construction for external integrations.
 *
 * @module
 * @category Collections/ScheduledImports
 */

import type { Field } from "payload";

export const webhookFields: Field[] = [
  {
    name: "webhookEnabled",
    type: "checkbox",
    defaultValue: false,
    admin: {
      position: "sidebar",
      description: "Enable webhook URL for triggering this import on-demand",
    },
  },
  {
    name: "webhookToken",
    type: "text",
    maxLength: 64,
    admin: {
      hidden: true, // Not shown in UI, only stored in DB
    },
  },
  {
    name: "webhookUrl",
    type: "text",
    admin: {
      readOnly: true,
      description: "POST to this URL to trigger the import",
      condition: (data) => Boolean(data?.webhookEnabled && data?.webhookToken),
    },
    hooks: {
      afterRead: [
        ({ data }) => {
          if (data?.webhookEnabled && data?.webhookToken) {
            const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000";
            return `${baseUrl}/api/webhooks/trigger/${data.webhookToken}`;
          }
          return null;
        },
      ],
    },
  },
];
