/**
 * React Query hook for fetching scheduled ingests.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { ScheduledIngest } from "@/payload-types";

import { QUERY_PRESETS } from "./query-presets";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

export const useScheduledIngestsQuery = (initialData?: ScheduledIngest[]) =>
  useQuery({
    queryKey: scheduledIngestKeys.all,
    queryFn: () => fetchCollectionDocs<ScheduledIngest>("/api/scheduled-ingests?sort=-updatedAt&limit=200"),
    initialData,
    ...QUERY_PRESETS.standard,
  });
