/**
 * React Query hook for fetching ingest jobs by ingest file ID.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { IngestJob } from "@/payload-types";

import { createActivePollingInterval, QUERY_PRESETS } from "./query-presets";

const SETTLED_STAGES = new Set(["completed", "failed", "needs-review"]);
const pollActiveJobs = createActivePollingInterval<IngestJob>((job) => !SETTLED_STAGES.has(job.stage), 5000);

export const ingestJobKeys = {
  all: ["ingest-jobs"] as const,
  byFile: (fileId: number) => [...ingestJobKeys.all, "file", fileId] as const,
};

export const useIngestJobsByFileQuery = (ingestFileId: number | null, isFileActive = false) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ingestJobKeys.byFile(ingestFileId ?? 0),
    queryFn: () =>
      fetchCollectionDocs<IngestJob>(
        `/api/ingest-jobs?where[ingestFile][equals]=${ingestFileId}&sort=-createdAt&limit=20`
      ),
    enabled: ingestFileId != null,
    ...QUERY_PRESETS.standard,
    // The file can be active before its first job exists. Keep polling then,
    // and let active jobs deliver their final state after the file settles.
    refetchInterval: isFileActive ? 5000 : pollActiveJobs,
  });

  useEffect(() => {
    // A fast import may finish before its jobs appeared in the previous poll.
    if (!isFileActive && ingestFileId != null) {
      void queryClient.invalidateQueries({ queryKey: ingestJobKeys.byFile(ingestFileId) });
    }
  }, [ingestFileId, isFileActive, queryClient]);

  return query;
};
