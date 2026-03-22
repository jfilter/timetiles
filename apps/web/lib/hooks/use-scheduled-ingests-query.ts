/**
 * React Query hook for fetching scheduled ingests.
 *
 * Automatically polls when any schedule is actively running.
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

const POLL_INTERVAL = 5000;

export const useScheduledIngestsQuery = (initialData?: ScheduledIngest[]) =>
  useQuery({
    queryKey: scheduledIngestKeys.all,
    queryFn: () => fetchCollectionDocs<ScheduledIngest>("/api/scheduled-ingests?sort=-updatedAt&limit=200"),
    initialData,
    ...QUERY_PRESETS.standard,
    // eslint-disable-next-line sonarjs/function-return-type -- React Query refetchInterval API requires false | number
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs?.length) return false;
      const hasRunning = docs.some((d) => d.lastStatus === "running");
      return hasRunning ? POLL_INTERVAL : false;
    },
  });
