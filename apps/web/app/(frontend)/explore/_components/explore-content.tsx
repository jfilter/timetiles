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

import { Suspense } from "react";

import { useMediaQuery } from "@/lib/hooks/use-media-query";

import { ListExplorer } from "./list-explorer";
import { MapExplorer } from "./map-explorer";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export const ExploreContent = () => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Before media query resolves (SSR / first frame), show loading
  if (isDesktop === null) return LOADING_ELEMENT;

  return <Suspense fallback={LOADING_ELEMENT}>{isDesktop ? <MapExplorer /> : <ListExplorer />}</Suspense>;
};
