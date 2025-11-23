/**
 * Defines the Payload CMS global configuration for Settings.
 *
 * Globals in Payload are used for managing site-wide settings. This configuration
 * stores newsletter service integration settings that are used by the newsletter
 * subscription API to forward email subscriptions to external services.
 *
 * @module
 */
import type { GlobalConfig } from "payload";

export const Settings: GlobalConfig = {
  slug: "settings",
  access: {
    read: () => true,
    update: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "newsletter",
      type: "group",
      label: "Newsletter Configuration",
      fields: [
        {
          name: "serviceUrl",
          type: "text",
          label: "Newsletter Service URL",
          admin: {
            description:
              "External newsletter service endpoint to POST email subscriptions (e.g., Listmonk: http://localhost:9000/api/subscribers, Mailchimp API, etc.)",
          },
        },
        {
          name: "authHeader",
          type: "text",
          label: "Authorization Header",
          admin: {
            description:
              "Optional: Authorization header for the newsletter service (e.g., 'Bearer YOUR_TOKEN' or 'Basic BASE64_CREDENTIALS'). Leave empty if not required.",
          },
        },
      ],
    },
  ],
};
