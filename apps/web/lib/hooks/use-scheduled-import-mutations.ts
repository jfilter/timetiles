/**
 * React Query mutation hooks for scheduled import operations.
 *
 * Provides toggle, delete, and manual trigger mutations.
 *
 * @module
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ScheduledImport } from "@/payload-types";

import { fetchJson } from "../api/http-error";

export const scheduledImportKeys = { all: ["scheduled-imports"] as const };

export const useToggleScheduledImportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const result = await fetchJson<{ doc: ScheduledImport }>(`/api/scheduled-imports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      return result.doc;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledImportKeys.all });
    },
  });
};

export const useDeleteScheduledImportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await fetchJson(`/api/scheduled-imports/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledImportKeys.all });
    },
  });
};

export const useTriggerScheduledImportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await fetchJson(`/api/scheduled-imports/${id}/trigger`, { method: "POST", credentials: "include" });
      // Refresh the specific schedule to get updated lastRun
      return fetchJson<ScheduledImport>(`/api/scheduled-imports/${id}`, { credentials: "include" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledImportKeys.all });
    },
  });
};
