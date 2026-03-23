/**
 * Error boundary for embed routes.
 *
 * Minimal UI without navigation chrome — just an error message
 * and a retry button.
 *
 * @module
 */
"use client";

import { useTranslations } from "next-intl";

export default function EmbedError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations("Embed");

  return (
    <div className="flex h-screen items-center justify-center p-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">{t("errorTitle")}</h1>
        <button type="button" onClick={reset} className="text-primary mt-2 text-sm underline">
          {t("tryAgain")}
        </button>
      </div>
    </div>
  );
}
