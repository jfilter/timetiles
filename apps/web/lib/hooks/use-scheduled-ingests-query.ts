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

import { type AccountListInitial, useAccountListScope } from "./account-list-scope";
import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

const POLL_INTERVAL = 5000;

export const useScheduledIngestsQuery = (initial?: AccountListInitial<ScheduledIngest>) => {
  const { userId, initialData } = useAccountListScope(initial);
  return useQuery({
    queryKey: [...scheduledIngestKeys.all, "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () =>
            fetchCollectionDocs<ScheduledIngest>(
              `/api/scheduled-ingests?sort=-updatedAt&limit=200&where[createdBy][equals]=${userId}`
            ),
    initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<ScheduledIngest>((d) => d.lastStatus === "running", POLL_INTERVAL),
  });
};
