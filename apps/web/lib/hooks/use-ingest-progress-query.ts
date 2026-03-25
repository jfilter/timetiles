/**
 * React Query hook for polling ingest file progress.
 *
 * Replaces hand-rolled setInterval polling in step-processing.tsx.
 * Automatically stops polling when the ingest reaches a terminal state.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";
import type { ProgressApiResponse } from "../types/progress-tracking";
import { createItemPollingInterval } from "./query-presets";

export type { ProgressApiResponse } from "../types/progress-tracking";

const POLL_INTERVAL_MS = 2000;

const fetchProgress = (ingestFileId: string | number) =>
  fetchJson<ProgressApiResponse>(`/api/ingest/${ingestFileId}/progress`, { credentials: "include" });

const isInProgress = (data: ProgressApiResponse) => data.status !== "completed" && data.status !== "failed";

export const ingestProgressQueryKeys = {
  all: ["import-progress"] as const,
  byFile: (ingestFileId: string | number) => [...ingestProgressQueryKeys.all, String(ingestFileId)] as const,
};

export const useIngestProgressQuery = (ingestFileId: string | number | null) =>
  useQuery({
    queryKey: ingestProgressQueryKeys.byFile(ingestFileId ?? ""),
    queryFn: () => fetchProgress(ingestFileId ?? ""),
    enabled: ingestFileId != null,
    refetchInterval: createItemPollingInterval(isInProgress, POLL_INTERVAL_MS),
  });
