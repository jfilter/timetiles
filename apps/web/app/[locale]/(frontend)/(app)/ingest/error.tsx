/**
 * Error boundary for the import wizard.
 *
 * Catches rendering errors in wizard step components so users
 * see a recovery option instead of a blank page.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { useTranslations } from "next-intl";

import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { Link } from "@/i18n/navigation";

export default function ImportError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations("Ingest");
  const tCommon = useTranslations("Common");

  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      title={t("errorTitle")}
      description={t("errorDescription")}
      tryAgainLabel={tCommon("tryAgain")}
      logContext="Import wizard crashed"
      className="min-h-[400px]"
    >
      <Button type="button" variant="ghost" asChild>
        <Link href="/ingest">{tCommon("startOver")}</Link>
      </Button>
    </RouteErrorBoundary>
  );
}
