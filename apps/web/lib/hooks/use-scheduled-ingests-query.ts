/**
 * React Query hook for fetching scheduled ingests.
 *
 * Automatically polls when any schedule is actively running.
 *
 * @module
 * @category Hooks
 */
"use client";

import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { ScheduledIngest } from "@/payload-types";

import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";
import { useAuthState } from "./use-auth-queries";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

const POLL_INTERVAL = 5000;

export const useScheduledIngestsQuery = (initialData?: ScheduledIngest[]) => {
  const { userId } = useAuthState();
  return useQuery({
    queryKey: [...scheduledIngestKeys.all, "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () =>
            fetchCollectionDocs<ScheduledIngest>(
              `/api/scheduled-ingests?sort=-updatedAt&limit=200&where[createdBy][equals]=${userId}`
            ),
    initialData: userId == null ? undefined : initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<ScheduledIngest>((d) => d.lastStatus === "running", POLL_INTERVAL),
  });
};
