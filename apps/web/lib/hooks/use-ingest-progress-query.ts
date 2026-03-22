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

export interface ProgressApiResponse {
  type: string;
  id: number;
  status: "pending" | "parsing" | "processing" | "completed" | "failed";
  originalName: string;
  catalogId: number | null;
  datasetsCount: number;
  datasetsProcessed: number;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  jobs: Array<{
    id: string | number;
    datasetId: string | number;
    datasetName?: string;
    currentStage: string;
    overallProgress: number;
    stages?: Array<{
      name: string;
      displayName: string;
      status: "pending" | "in_progress" | "completed" | "skipped";
      progress: number;
      startedAt: string | null;
      completedAt: string | null;
      batches: { current: number; total: number };
      currentBatch: { rowsProcessed: number; rowsTotal: number; percentage: number };
      performance: { rowsPerSecond: number | null; estimatedSecondsRemaining: number | null };
    }>;
    results?: { totalEvents?: number };
  }>;
  errorLog?: string | null;
  completedAt?: string | null;
}

const POLL_INTERVAL_MS = 2000;

const fetchProgress = (ingestFileId: string | number) =>
  fetchJson<ProgressApiResponse>(`/api/ingest/${ingestFileId}/progress`, { credentials: "include" });

export const ingestProgressQueryKeys = {
  all: ["import-progress"] as const,
  byFile: (ingestFileId: string | number) => [...ingestProgressQueryKeys.all, String(ingestFileId)] as const,
};

export const useIngestProgressQuery = (ingestFileId: string | number | null) =>
  useQuery({
    queryKey: ingestProgressQueryKeys.byFile(ingestFileId ?? ""),
    queryFn: () => fetchProgress(ingestFileId!),
    enabled: ingestFileId != null,
    // eslint-disable-next-line sonarjs/function-return-type -- React Query refetchInterval API requires false | number
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return POLL_INTERVAL_MS;
    },
  });
