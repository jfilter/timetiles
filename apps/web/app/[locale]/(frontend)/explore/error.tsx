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

import { Button } from "@timetiles/ui";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { logError } from "@/lib/logger";

export default function ExploreError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");

  useEffect(() => {
    logError(error, "Explore page crashed");
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <AlertTriangleIcon className="text-destructive mx-auto h-12 w-12" />
        <h2 className="text-cartographic-charcoal font-serif text-xl font-semibold">{t("errorTitle")}</h2>
        <p className="text-cartographic-navy/70 text-sm">{t("errorDescription")}</p>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcwIcon className="mr-2 h-4 w-4" />
          {tCommon("tryAgain")}
        </Button>
      </div>
    </div>
  );
}
