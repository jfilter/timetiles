/**
 * Hook to derive a ViewScope from the current view context.
 *
 * Returns a stable scope object for passing to query hooks, or
 * undefined if no view scope is active.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMemo } from "react";

import { useViewOptional } from "@/lib/context/view-context";

import type { ViewScope } from "../utils/event-params";

/**
 * Derives a ViewScope from the active view context.
 * Returns undefined if no view is active or scope is "all".
 */
export const useViewScope = (): ViewScope | undefined => {
  const viewContext = useViewOptional();

  return useMemo(() => {
    if (!viewContext?.dataScope) return undefined;
    const { catalogIds, datasetIds } = viewContext.dataScope;
    if (!catalogIds?.length && !datasetIds?.length) return undefined;
    return { catalogIds, datasetIds };
  }, [viewContext?.dataScope]);
};
