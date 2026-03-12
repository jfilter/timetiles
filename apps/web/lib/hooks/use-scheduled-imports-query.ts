/**
 * React Query hook for fetching scheduled imports.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { ScheduledImport } from "@/payload-types";

import { fetchJson } from "../api/http-error";
import { scheduledImportKeys } from "./use-scheduled-import-mutations";

interface ScheduledImportsResponse {
  docs: ScheduledImport[];
  totalDocs: number;
}

export const useScheduledImportsQuery = (initialData?: ScheduledImport[]) =>
  useQuery({
    queryKey: scheduledImportKeys.all,
    queryFn: async () => {
      const data = await fetchJson<ScheduledImportsResponse>("/api/scheduled-imports?sort=-updatedAt&limit=200", {
        credentials: "include",
      });
      return data.docs;
    },
    initialData,
    staleTime: 60_000,
  });
