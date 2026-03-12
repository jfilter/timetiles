/**
 * React Query hooks for account management operations.
 *
 * Provides typed mutations for changing email/password, fetching the
 * deletion summary, and scheduling account deletion.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";
import type { DeletionSummary } from "../services/account-deletion-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for the change-email mutation. */
export interface ChangeEmailInput {
  newEmail: string;
  password: string;
}

/** Response from `/api/users/change-email`. */
interface ChangeEmailResponse {
  success: boolean;
  message: string;
  verificationRequired?: boolean;
}

/** Input for the change-password mutation. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Response from `/api/users/change-password`. */
interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

/** Response from `/api/account/deletion-summary`. */
export interface DeletionSummaryResponse {
  summary: DeletionSummary;
  canDelete: boolean;
  reason?: string;
  deletionStatus?: string;
  deletionScheduledAt?: string;
}

/** Input for the schedule-deletion mutation. */
export interface ScheduleDeletionInput {
  password: string;
}

/** Response from `/api/users/schedule-deletion`. */
export interface ScheduleDeletionResponse {
  success: boolean;
  message: string;
  deletionScheduledAt: string;
  summary: DeletionSummary;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const accountKeys = {
  all: ["account"] as const,
  deletionSummary: () => [...accountKeys.all, "deletion-summary"] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch the deletion summary for the current user.
 *
 * Disabled by default -- callers opt in via `enabled`.
 */
export const useDeletionSummaryQuery = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: accountKeys.deletionSummary(),
    queryFn: () => fetchJson<DeletionSummaryResponse>("/api/account/deletion-summary", { credentials: "include" }),
    enabled: options?.enabled ?? false,
  });
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Change the current user's email via `/api/users/change-email`.
 */
export const changeEmailRequest = (input: ChangeEmailInput): Promise<ChangeEmailResponse> =>
  fetchJson<ChangeEmailResponse>("/api/users/change-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

export const useChangeEmailMutation = () => useMutation({ mutationFn: changeEmailRequest });

/**
 * Change the current user's password via `/api/users/change-password`.
 */
export const changePasswordRequest = (input: ChangePasswordInput): Promise<ChangePasswordResponse> =>
  fetchJson<ChangePasswordResponse>("/api/users/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

export const useChangePasswordMutation = () => useMutation({ mutationFn: changePasswordRequest });

/**
 * Cancel a pending account deletion via `/api/users/cancel-deletion`.
 */
export const useCancelDeletionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchJson<void>("/api/users/cancel-deletion", { method: "POST", credentials: "include" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.deletionSummary() });
    },
  });
};

/**
 * Schedule account deletion via `/api/users/schedule-deletion`.
 */
export const useScheduleDeletionMutation = () => {
  return useMutation({
    mutationFn: (input: ScheduleDeletionInput) =>
      fetchJson<ScheduleDeletionResponse>("/api/users/schedule-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      }),
  });
};
