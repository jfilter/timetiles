/**
 * React Query mutation hook for approving NEEDS_REVIEW import jobs.
 *
 * Supports two flows:
 * 1. Simple approval: "Continue without" (e.g., no timestamp → approve as-is)
 * 2. Approval with field override: user picks a column from a dropdown
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";

import { ingestJobKeys } from "./use-ingest-jobs-query";

export interface ApproveIngestJobRequest {
  ingestJobId: string | number;
  /** For no-timestamp: column name to use as timestamp field. */
  timestampPath?: string;
  /** For no-location: column name to use as location/address field. */
  locationPath?: string;
  /** For no-location: column name for latitude. */
  latitudePath?: string;
  /** For no-location: column name for longitude. */
  longitudePath?: string;
}

interface ApproveIngestJobResponse {
  message: string;
  reviewReason: string;
  fieldOverridesApplied: boolean;
}

const approveIngestJob = async ({ ingestJobId, ...body }: ApproveIngestJobRequest): Promise<ApproveIngestJobResponse> =>
  fetchJson<ApproveIngestJobResponse>(`/api/ingest-jobs/${ingestJobId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Mutation hook for approving a NEEDS_REVIEW import job.
 *
 * Usage:
 * ```tsx
 * const approve = useApproveIngestJobMutation();
 * // Simple approval (continue without):
 * approve.mutate({ ingestJobId: "123" });
 * // Approval with field override (column picker):
 * approve.mutate({ ingestJobId: "123", timestampPath: "date_column" });
 * ```
 */
export const useApproveIngestJobMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveIngestJob,
    onSuccess: () => {
      // Invalidate ingest job queries so the UI refreshes
      void queryClient.invalidateQueries({ queryKey: ingestJobKeys.all });
    },
  });
};
