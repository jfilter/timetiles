/**
 * Seed data for the Settings global.
 *
 * The default seed (`settingsSeed` / `settingsSeedDe`) is used by the
 * development/testing/e2e CLI presets and by the `deploy` preset when no
 * `DEPLOYMENT_ENVIRONMENT` is set (e.g. local `pnpm dev`).
 *
 * `settingsSeedDeploy` / `settingsSeedDeployDe` provide per-deployment
 * overrides used only when the `deploy` preset runs with a known
 * `DEPLOYMENT_ENVIRONMENT`:
 * - `staging` shows a "data may be reset" disclaimer
 * - `production` ships a clean state — admins set legal copy in the dashboard
 *
 * @module
 */
import type { Setting } from "@/payload-types";

import type { DeploymentEnv } from "../types";

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

export const settingsSeedDeploy: Record<DeploymentEnv, SettingsSeed> = {
  staging: {
    legal: {
      termsUrl: "/terms",
      privacyUrl: "/privacy",
      registrationDisclaimer: "This is a staging instance — data may be reset without notice.",
    },
  },
  production: { legal: { termsUrl: "/terms", privacyUrl: "/privacy", registrationDisclaimer: null } },
};

export const settingsSeedDeployDe: Record<DeploymentEnv, SettingsSeed> = {
  staging: {
    legal: {
      termsUrl: "/terms",
      privacyUrl: "/privacy",
      registrationDisclaimer: "Dies ist eine Staging-Instanz — Daten können jederzeit zurückgesetzt werden.",
    },
  },
  production: { legal: { termsUrl: "/terms", privacyUrl: "/privacy", registrationDisclaimer: null } },
};
