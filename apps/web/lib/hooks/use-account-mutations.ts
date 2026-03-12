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
    queryFn: async (): Promise<DeletionSummaryResponse> => {
      const response = await fetch("/api/account/deletion-summary", { credentials: "include" });
      const data = (await response.json()) as DeletionSummaryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to fetch summary");
      }

      return data;
    },
    enabled: options?.enabled ?? false,
  });
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Change the current user's email via `/api/users/change-email`.
 */
export const changeEmailRequest = async (input: ChangeEmailInput): Promise<ChangeEmailResponse> => {
  const response = await fetch("/api/users/change-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ChangeEmailResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to change email");
  }

  return data;
};

export const useChangeEmailMutation = () => useMutation({ mutationFn: changeEmailRequest });

/**
 * Change the current user's password via `/api/users/change-password`.
 */
export const changePasswordRequest = async (input: ChangePasswordInput): Promise<ChangePasswordResponse> => {
  const response = await fetch("/api/users/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ChangePasswordResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to change password");
  }

  return data;
};

export const useChangePasswordMutation = () => useMutation({ mutationFn: changePasswordRequest });

/**
 * Schedule account deletion via `/api/users/schedule-deletion`.
 */
/**
 * Cancel a pending account deletion via `/api/users/cancel-deletion`.
 */
export const useCancelDeletionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await fetch("/api/users/cancel-deletion", { method: "POST", credentials: "include" });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to cancel deletion");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.deletionSummary() });
    },
  });
};

export const useScheduleDeletionMutation = () => {
  return useMutation({
    mutationFn: async (input: ScheduleDeletionInput): Promise<ScheduleDeletionResponse> => {
      const response = await fetch("/api/users/schedule-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });

      const data = (await response.json()) as ScheduleDeletionResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to schedule deletion");
      }

      return data;
    },
  });
};
