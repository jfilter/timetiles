/**
 * Thin sticky bar that announces non-production deployments.
 *
 * Visitors should be able to tell at a glance whether they are on staging,
 * a preview build, or production. Renders nothing when DEPLOYMENT_ENVIRONMENT
 * is "production" (the default), so prod pays zero markup cost.
 *
 * Server component — reads env via `getEnv()` so the same Docker image can be
 * deployed as either staging or prod by flipping a single env var.
 *
 * @module
 * @category Components
 */
import { getTranslations } from "next-intl/server";

import { getEnv } from "@/lib/config/env";

const ENV_STYLES: Record<"staging" | "preview" | "development", string> = {
  staging: "bg-amber-500 text-amber-950",
  preview: "bg-sky-500 text-sky-950",
  development: "bg-emerald-500 text-emerald-950",
};

export const EnvironmentBanner = async (): Promise<React.ReactElement | null> => {
  const env = getEnv().DEPLOYMENT_ENVIRONMENT;
  if (env === "production") return null;

  const t = await getTranslations("EnvironmentBanner");
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${ENV_STYLES[env]} sticky top-0 z-50 w-full px-4 py-1 text-center text-xs font-medium tracking-wide`}
      data-environment={env}
    >
      {t(env)}
    </div>
  );
};
