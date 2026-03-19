/**
 * Error boundary for the explore page.
 *
 * Catches rendering errors in map, charts, and event list components
 * so they don't crash the entire application.
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";

import { RouteErrorBoundary } from "@/components/route-error-boundary";

export default function ExploreError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");

  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      title={t("errorTitle")}
      description={t("errorDescription")}
      tryAgainLabel={tCommon("tryAgain")}
      logContext="Explore page crashed"
    />
  );
}
