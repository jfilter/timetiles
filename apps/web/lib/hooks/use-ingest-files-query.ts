/**
 * React Query hook for fetching the current user's ingest files (manual imports).
 *
 * Automatically polls when any import is still in progress.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { IngestFile } from "@/payload-types";

import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";

export const ingestFileKeys = { all: ["ingest-files"] as const };

const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const POLL_INTERVAL = 5000;

export const useIngestFilesQuery = (initialData?: IngestFile[]) =>
  useQuery({
    queryKey: ingestFileKeys.all,
    queryFn: () => fetchCollectionDocs<IngestFile>("/api/ingest-files?sort=-createdAt&limit=200"),
    initialData,
    ...QUERY_PRESETS.standard,
    refetchInterval: createActivePollingInterval<IngestFile>(
      (d) => !TERMINAL_STATUSES.has(d.status ?? ""),
      POLL_INTERVAL
    ),
  });
