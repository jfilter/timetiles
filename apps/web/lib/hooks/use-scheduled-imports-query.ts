/**
 * React Query hook for fetching scheduled imports.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { ScheduledImport } from "@/payload-types";

import { fetchCollectionDocs } from "./use-payload-collection-query";
import { scheduledImportKeys } from "./use-scheduled-import-mutations";

export const useScheduledImportsQuery = (initialData?: ScheduledImport[]) =>
  useQuery({
    queryKey: scheduledImportKeys.all,
    queryFn: () => fetchCollectionDocs<ScheduledImport>("/api/scheduled-imports?sort=-updatedAt&limit=200"),
    initialData,
    staleTime: 60_000,
  });
