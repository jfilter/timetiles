/**
 * React Query hook for polling import file progress.
 *
 * Replaces hand-rolled setInterval polling in step-processing.tsx.
 * Automatically stops polling when the import reaches a terminal state.
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
    stages?: Array<{ name: string; status: string; progress: number }>;
    results?: { totalEvents?: number };
  }>;
  errorLog?: string | null;
  completedAt?: string | null;
}

const POLL_INTERVAL_MS = 2000;

const fetchProgress = (importFileId: string | number) =>
  fetchJson<ProgressApiResponse>(`/api/import/${importFileId}/progress`, { credentials: "include" });

export const importProgressQueryKeys = {
  all: ["import-progress"] as const,
  byFile: (importFileId: string | number) => [...importProgressQueryKeys.all, String(importFileId)] as const,
};

export const useImportProgressQuery = (importFileId: string | number | null) =>
  useQuery({
    queryKey: importProgressQueryKeys.byFile(importFileId ?? ""),
    queryFn: () => fetchProgress(importFileId!),
    enabled: importFileId != null,
    // eslint-disable-next-line sonarjs/function-return-type -- React Query refetchInterval API requires false | number
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return POLL_INTERVAL_MS;
    },
  });
