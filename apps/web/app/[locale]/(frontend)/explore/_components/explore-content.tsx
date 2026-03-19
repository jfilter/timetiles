/**
 * Shared explore content component used by the explore page.
 *
 * Conditionally renders MapExplorer on desktop and ListExplorer on mobile
 * based on viewport width, avoiding mounting both simultaneously and
 * eliminating duplicate queries.
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { BREAKPOINT_MD } from "@/lib/constants/breakpoints";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

import { ListExplorer } from "./list-explorer";
import { MapExplorer } from "./map-explorer";

export const ExploreContent = () => {
  const t = useTranslations("Explore");
  const isDesktop = useMediaQuery(BREAKPOINT_MD);

  const loadingElement = <div>{t("loadingExplorer")}</div>;

  // Before media query resolves (SSR / first frame), show loading
  if (isDesktop === null) return loadingElement;

  return <Suspense fallback={loadingElement}>{isDesktop ? <MapExplorer /> : <ListExplorer />}</Suspense>;
};
