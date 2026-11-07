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

import { type AccountListInitial, useAccountListScope } from "./account-list-scope";
import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";

export const ingestFileKeys = { all: ["ingest-files"] as const };

const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const POLL_INTERVAL = 5000;

const hasSettledWithoutBackgroundWork = (file: IngestFile): boolean => {
  const total = file.datasetsCount ?? 0;
  const processed = file.datasetsProcessed ?? 0;
  return file.status === "processing" && total > 0 && processed >= total;
};

export const isIngestFileActive = (file: IngestFile): boolean =>
  !TERMINAL_STATUSES.has(file.status ?? "") && !hasSettledWithoutBackgroundWork(file);

export const useIngestFilesQuery = (initial?: AccountListInitial<IngestFile>) => {
  const { userId, initialData } = useAccountListScope(initial);
  return useQuery({
    queryKey: [...ingestFileKeys.all, "user", userId],
    queryFn:
      userId == null
        ? skipToken
        : () =>
            fetchCollectionDocs<IngestFile>(
              `/api/ingest-files?sort=-createdAt&limit=200&where[user][equals]=${userId}`
            ),
    initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<IngestFile>(isIngestFileActive, POLL_INTERVAL),
  });
};
