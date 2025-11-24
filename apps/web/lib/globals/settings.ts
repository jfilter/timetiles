/**
 * Defines the Payload CMS global configuration for Settings.
 *
 * Globals in Payload are used for managing site-wide settings. This configuration
 * stores application-wide settings including newsletter integration and geocoding
 * service configuration.
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
    {
      name: "geocoding",
      type: "group",
      label: "Geocoding Configuration",
      fields: [
        {
          name: "enabled",
          type: "checkbox",
          label: "Enable Geocoding",
          defaultValue: true,
          admin: {
            description: "Enable or disable geocoding globally for event imports",
          },
        },
        {
          name: "fallbackEnabled",
          type: "checkbox",
          label: "Enable Provider Fallback",
          defaultValue: true,
          admin: {
            description: "When enabled, will try alternative providers if the primary provider fails",
          },
        },
        {
          name: "providerSelection",
          type: "group",
          label: "Provider Selection",
          fields: [
            {
              name: "strategy",
              type: "select",
              label: "Selection Strategy",
              defaultValue: "priority",
              options: [
                { label: "Priority-based", value: "priority" },
                { label: "Tag-based", value: "tag-based" },
              ],
              admin: {
                description: "How to select which geocoding provider to use",
              },
            },
            {
              name: "requiredTags",
              type: "select",
              hasMany: true,
              label: "Required Tags",
              options: [
                { label: "Production", value: "production" },
                { label: "Development", value: "development" },
                { label: "Testing", value: "testing" },
                { label: "Primary", value: "primary" },
                { label: "Secondary", value: "secondary" },
                { label: "Backup", value: "backup" },
              ],
              admin: {
                description: "Only use providers with these tags (for tag-based strategy)",
                condition: (_data, siblingData) => (siblingData as { strategy?: string })?.strategy === "tag-based",
              },
            },
          ],
        },
        {
          name: "caching",
          type: "group",
          label: "Caching Configuration",
          fields: [
            {
              name: "enabled",
              type: "checkbox",
              label: "Enable Cache",
              defaultValue: true,
              admin: {
                description: "Cache geocoding results to reduce API calls and improve performance",
              },
            },
            {
              name: "ttlDays",
              type: "number",
              label: "Cache TTL (Days)",
              defaultValue: 30,
              min: 1,
              max: 365,
              admin: {
                description: "How long to keep cached geocoding results (in days)",
              },
            },
          ],
        },
      ],
    },
  ],
};
