/**
 * React Query hook for fetching a single scheduled ingest.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";
import type { ScheduledIngest } from "@/payload-types";

import { QUERY_PRESETS } from "./query-presets";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

export const useScheduledIngestQuery = (id: number | null) =>
  useQuery({
    queryKey: scheduledIngestKeys.byId(id),
    queryFn: async () => {
      return fetchJson<ScheduledIngest>(`/api/scheduled-ingests/${id}?depth=1`, { credentials: "include" });
    },
    enabled: id !== null,
    ...QUERY_PRESETS.standard,
  });
