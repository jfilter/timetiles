/**
 * React Query hook for fetching ingest jobs by ingest file ID.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCollectionDocs } from "@/lib/api/payload-collection";
import type { IngestJob } from "@/payload-types";

import { QUERY_PRESETS } from "./query-presets";

export const ingestJobKeys = {
  all: ["ingest-jobs"] as const,
  byFile: (fileId: number) => [...ingestJobKeys.all, "file", fileId] as const,
};

export const useIngestJobsByFileQuery = (ingestFileId: number | null) =>
  useQuery({
    queryKey: ingestJobKeys.byFile(ingestFileId ?? 0),
    queryFn: () =>
      fetchCollectionDocs<IngestJob>(
        `/api/ingest-jobs?where[ingestFile][equals]=${ingestFileId}&sort=-createdAt&limit=20`
      ),
    enabled: ingestFileId != null,
    ...QUERY_PRESETS.standard,
  });
