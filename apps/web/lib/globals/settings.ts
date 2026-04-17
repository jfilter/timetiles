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

import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";

export const Settings: GlobalConfig = {
  slug: "settings",
  admin: { group: "System" },
  access: {
    // Admin-only read — server-side services use overrideAccess: true,
    // frontend uses /api/feature-flags (which reads flags via the service layer)
    read: ({ req: { user } }) => user?.role === "admin",
    update: ({ req: { user } }) => user?.role === "admin",
  },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (!req.user || !previousDoc) return doc;

        // Detect feature flag changes
        const prevFlags = (previousDoc.featureFlags ?? {}) as Record<string, unknown>;
        const newFlags = (doc.featureFlags ?? {}) as Record<string, unknown>;
        const changedFlags: Record<string, { from: unknown; to: unknown }> = {};

        for (const key of new Set([...Object.keys(prevFlags), ...Object.keys(newFlags)])) {
          if (prevFlags[key] !== newFlags[key]) {
            changedFlags[key] = { from: prevFlags[key], to: newFlags[key] };
          }
        }

        if (Object.keys(changedFlags).length > 0) {
          await auditLog(
            req.payload,
            {
              action: AUDIT_ACTIONS.FEATURE_FLAG_CHANGED,
              userId: req.user.id,
              userEmail: req.user.email,
              details: { changedFlags },
            },
            { req }
          );
        }

        // Detect geocoding, newsletter, or legal config changes
        const prevGeo = JSON.stringify(previousDoc.geocoding ?? {});
        const newGeo = JSON.stringify(doc.geocoding ?? {});
        const prevNewsletter = JSON.stringify(previousDoc.newsletter ?? {});
        const newNewsletter = JSON.stringify(doc.newsletter ?? {});
        const prevLegal = JSON.stringify(previousDoc.legal ?? {});
        const newLegal = JSON.stringify(doc.legal ?? {});

        if (prevGeo !== newGeo || prevNewsletter !== newNewsletter || prevLegal !== newLegal) {
          await auditLog(req.payload, {
            action: AUDIT_ACTIONS.SETTINGS_CHANGED,
            userId: req.user.id,
            userEmail: req.user.email,
            details: {
              geocodingChanged: prevGeo !== newGeo,
              newsletterChanged: prevNewsletter !== newNewsletter,
              legalChanged: prevLegal !== newLegal,
            },
          });
        }

        return doc;
      },
    ],
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
          access: {
            read: ({ req: { user } }) => user?.role === "admin",
            update: ({ req: { user } }) => user?.role === "admin",
          },
          admin: {
            description:
              "Optional: Authorization header for the newsletter service (e.g., 'Bearer YOUR_TOKEN' or 'Basic BASE64_CREDENTIALS'). Leave empty if not required.",
          },
        },
      ],
    },
    {
      name: "legal",
      type: "group",
      label: "Legal Notices",
      admin: { description: "Legal links and disclaimers shown on the registration page" },
      fields: [
        {
          name: "termsUrl",
          type: "text",
          label: "Terms of Service URL",
          admin: { description: "URL to the AGB / Terms of Service page (e.g., /terms). Leave empty for no link." },
        },
        {
          name: "privacyUrl",
          type: "text",
          label: "Privacy Policy URL",
          admin: { description: "URL to the DSGVO / Privacy Policy page (e.g., /privacy). Leave empty for no link." },
        },
        {
          name: "registrationDisclaimer",
          type: "textarea",
          label: "Registration Disclaimer",
          localized: true,
          admin: {
            description:
              "Optional notice below the registration form (e.g., 'This is a demo instance. Data may be deleted at any time.').",
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
          admin: { description: "Enable or disable geocoding globally for event imports" },
        },
        {
          name: "fallbackEnabled",
          type: "checkbox",
          label: "Enable Provider Fallback",
          defaultValue: true,
          admin: { description: "When enabled, will try alternative providers if the primary provider fails" },
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
              admin: { description: "How to select which geocoding provider to use" },
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
              admin: { description: "Cache geocoding results to reduce API calls and improve performance" },
            },
            {
              name: "ttlDays",
              type: "number",
              label: "Cache TTL (Days)",
              defaultValue: 30,
              min: 1,
              max: 365,
              admin: { description: "How long to keep cached geocoding results (in days)" },
            },
          ],
        },
      ],
    },
    {
      name: "featureFlags",
      type: "group",
      label: "Feature Flags",
      admin: { description: "Enable or disable major application features" },
      fields: [
        {
          name: "allowPrivateImports",
          type: "checkbox",
          label: "Allow Private Imports",
          defaultValue: true,
          admin: { description: "When enabled, users can create private imports visible only to themselves" },
        },
        {
          name: "enableScheduledIngests",
          type: "checkbox",
          label: "Enable scheduled ingests",
          defaultValue: true,
          admin: { description: "When enabled, users can create automated URL-based import schedules" },
        },
        {
          name: "enableRegistration",
          type: "checkbox",
          label: "Enable Public Registration",
          defaultValue: true,
          admin: { description: "When enabled, new users can self-register accounts" },
        },
        {
          name: "enableEventCreation",
          type: "checkbox",
          label: "Enable Event Creation",
          defaultValue: true,
          admin: { description: "When enabled, new events can be created (via imports or API)" },
        },
        {
          name: "enableDatasetCreation",
          type: "checkbox",
          label: "Enable Dataset Creation",
          defaultValue: true,
          admin: { description: "When enabled, users can create new datasets" },
        },
        {
          name: "enableImportCreation",
          type: "checkbox",
          label: "Enable Import Creation",
          defaultValue: true,
          admin: { description: "When enabled, users can create new import jobs" },
        },
        {
          name: "enableScheduledJobExecution",
          type: "checkbox",
          label: "Enable Scheduled Job Execution",
          defaultValue: true,
          admin: { description: "When enabled, scheduled ingest jobs will execute automatically" },
        },
        {
          name: "enableUrlFetchCaching",
          type: "checkbox",
          label: "Enable URL Fetch Caching",
          defaultValue: true,
          admin: { description: "When enabled, URL fetches for scheduled ingests are cached to reduce requests" },
        },
        {
          name: "enableScrapers",
          type: "checkbox",
          label: "Enable Scrapers",
          defaultValue: false,
          admin: { description: "When enabled, users with trust level 3+ can create scraper repos and run scrapers" },
        },
        {
          name: "enableExpertMode",
          type: "checkbox",
          label: "Enable Expert Mode",
          defaultValue: false,
          admin: {
            description:
              "When enabled, shows advanced clustering algorithm selection and parameter tuning in the map UI",
          },
        },
      ],
    },
  ],
};
