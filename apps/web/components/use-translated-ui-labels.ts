/**
 * Built-in texts of the shared UI components, translated for the active locale.
 *
 * @module
 * @category Components
 */
"use client";

import type { UILabels } from "@timetiles/ui/provider";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

export const useTranslatedUILabels = (): UILabels => {
  const t = useTranslations("Common");
  const tNewsletter = useTranslations("Newsletter");

  return useMemo(
    () => ({
      previous: t("previous"),
      next: t("next"),
      pageOf: (page: number, total: number) => t("pageOf", { page, total }),
      noResults: t("noResults"),
      openNavigation: t("openNavigation"),
      navigation: t("navigation"),
      navigationDescription: t("navigationDescription"),
      closeNavigation: t("closeNavigation"),
      loading: t("loading"),
      tryAgain: t("tryAgain"),
      confirm: t("confirm"),
      cancel: t("cancel"),
      updating: t("updating"),
      events: t("events"),
      total: t("total"),
      subscribing: tNewsletter("subscribing"),
      subscribed: tNewsletter("subscribed"),
      emptyTitle: t("emptyTitle"),
      emptySubtitle: t("emptySubtitle"),
      noMatchTitle: t("noMatchTitle"),
      noMatchSubtitle: t("noMatchSubtitle"),
      errorTitle: t("error"),
      errorSubtitle: t("errorSubtitle"),
      chartNoDataSubtitle: t("chartNoDataSubtitle"),
      chartNoMatchTitle: t("chartNoMatchTitle"),
      chartErrorTitle: t("chartErrorTitle"),
    }),
    [t, tNewsletter]
  );
};
