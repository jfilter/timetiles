/**
 * React Query hook for fetching the current user's ingest files (manual imports).
 *
 * Automatically polls when any import is still in progress.
 *
 * @module
 * @category Hooks
 */
"use client";

import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { IngestFile } from "@/payload-types";

import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";
import { useAuthState } from "./use-auth-queries";

export const ingestFileKeys = { all: ["ingest-files"] as const };

const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const POLL_INTERVAL = 5000;

const hasSettledWithoutBackgroundWork = (file: IngestFile): boolean => {
  const total = file.datasetsCount ?? 0;
  const processed = file.datasetsProcessed ?? 0;
  return file.status === "processing" && total > 0 && processed >= total;
};

export const useIngestFilesQuery = (initialData?: IngestFile[]) => {
  const { userId } = useAuthState();
  return useQuery({
    queryKey: [...ingestFileKeys.all, "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () =>
            fetchCollectionDocs<IngestFile>(
              `/api/ingest-files?sort=-createdAt&limit=200&where[user][equals]=${userId}`
            ),
    initialData: userId == null ? undefined : initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<IngestFile>(
      (d) => !TERMINAL_STATUSES.has(d.status ?? "") && !hasSettledWithoutBackgroundWork(d),
      POLL_INTERVAL
    ),
  });
};
