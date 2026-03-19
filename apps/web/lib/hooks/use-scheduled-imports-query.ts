/**
 * React Query hook for fetching scheduled imports.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { ScheduledImport } from "@/payload-types";

import { QUERY_PRESETS } from "./query-presets";
import { scheduledImportKeys } from "./use-scheduled-import-mutations";

export const useScheduledImportsQuery = (initialData?: ScheduledImport[]) =>
  useQuery({
    queryKey: scheduledImportKeys.all,
    queryFn: () => fetchCollectionDocs<ScheduledImport>("/api/scheduled-imports?sort=-updatedAt&limit=200"),
    initialData,
    ...QUERY_PRESETS.standard,
  });
