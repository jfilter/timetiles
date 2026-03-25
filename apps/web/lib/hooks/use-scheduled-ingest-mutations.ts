/**
 * React Query mutation hooks for scheduled ingest operations.
 *
 * Provides toggle, delete, and manual trigger mutations.
 *
 * @module
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ScheduledIngest } from "@/payload-types";

import { fetchJson } from "../api/http-error";

export const scheduledIngestKeys = {
  all: ["scheduled-ingests"] as const,
  byId: (id: number | null) => [...scheduledIngestKeys.all, id] as const,
};

export const useToggleScheduledIngestMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const result = await fetchJson<{ doc: ScheduledIngest }>(`/api/scheduled-ingests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      return result.doc;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledIngestKeys.all });
    },
  });
};

export const useDeleteScheduledIngestMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await fetchJson(`/api/scheduled-ingests/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledIngestKeys.all });
    },
  });
};

export const useTriggerScheduledIngestMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await fetchJson(`/api/scheduled-ingests/${id}/trigger`, { method: "POST", credentials: "include" });
      // Refresh the specific schedule to get updated lastRun
      return fetchJson<ScheduledIngest>(`/api/scheduled-ingests/${id}`, { credentials: "include" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledIngestKeys.all });
    },
  });
};
