/**
 * Attribution bar shown at the bottom of embedded views.
 *
 * Displays a small "Powered by TimeTiles" link that opens the main
 * site in a new tab, breaking out of the iframe.
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";

import { useView } from "@/lib/context/view-context";

export const EmbedAttribution = () => {
  const t = useTranslations("Embed");
  const { view } = useView();
  const viewParam = view?.slug ? `?view=${view.slug}` : "";
  const exploreUrl = `/explore${viewParam}`;

  return (
    <div className="bg-background/80 border-border/40 border-t px-3 py-0.5 text-right backdrop-blur-sm">
      <a
        href={exploreUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
      >
        {t("poweredBy")}
      </a>
    </div>
  );
};
