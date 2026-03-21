/**
 * Seed data for the Settings global.
 *
 * Seeds legal notice URLs and a registration disclaimer for development.
 * Other settings (newsletter, geocoding, feature flags) use field defaults.
 *
 * @module
 */
import type { Setting } from "@/payload-types";

export type SettingsSeed = Omit<Setting, "id" | "createdAt" | "updatedAt">;

export const settingsSeedDe: SettingsSeed = {
  legal: {
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    registrationDisclaimer: "Dies ist eine Demo-Instanz. Daten können jederzeit ohne Vorankündigung gelöscht werden.",
  },
};

export const settingsSeed: SettingsSeed = {
  legal: {
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    registrationDisclaimer: "This is a demo instance. Data may be deleted at any time without notice.",
  },
};
