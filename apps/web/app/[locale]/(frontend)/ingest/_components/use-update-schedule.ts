/**
 * Hook for updating an existing scheduled ingest via the wizard.
 *
 * @module
 * @category Components
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api/http-error";
import { scheduledIngestKeys } from "@/lib/hooks/use-scheduled-ingest-mutations";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type { FieldMapping, SheetMapping, UrlAuthConfig } from "@/lib/types/ingest-wizard";

import type { CatalogSelection, JsonApiConfig, ScheduleConfig } from "./wizard-store";
import { useWizardStore } from "./wizard-store";

export interface UpdateScheduleParams {
  editScheduleId: number;
  previewId: string;
  catalogId: CatalogSelection;
  newCatalogName: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  transforms: Record<number, IngestTransform[]>;
  scheduleConfig: ScheduleConfig;
  authConfig: UrlAuthConfig | null;
  jsonApiConfig: JsonApiConfig | null;
}

const buildPayload = (params: UpdateScheduleParams, triggerRun: boolean) => {
  const transformsPayload = Object.entries(params.transforms)
    .filter(([, t]) => t.length > 0)
    .map(([idx, transforms]) => ({ sheetIndex: Number(idx), transforms }));

  return {
    scheduledIngestId: params.editScheduleId,
    previewId: params.previewId,
    catalogId: params.catalogId,
    newCatalogName: params.catalogId === "new" ? params.newCatalogName : undefined,
    sheetMappings: params.sheetMappings,
    fieldMappings: params.fieldMappings,
    deduplicationStrategy: params.deduplicationStrategy,
    geocodingEnabled: params.geocodingEnabled,
    transforms: transformsPayload.length > 0 ? transformsPayload : undefined,
    scheduleConfig: {
      name: params.scheduleConfig.name,
      scheduleType: params.scheduleConfig.scheduleType,
      frequency: params.scheduleConfig.scheduleType === "frequency" ? params.scheduleConfig.frequency : undefined,
      cronExpression: params.scheduleConfig.scheduleType === "cron" ? params.scheduleConfig.cronExpression : undefined,
      schemaMode: params.scheduleConfig.schemaMode,
    },
    authConfig: params.authConfig ?? undefined,
    jsonApiConfig: params.jsonApiConfig ?? undefined,
    triggerRun,
  };
};

export const useUpdateSchedule = () => {
  const t = useTranslations("Ingest");
  const router = useRouter();
  const queryClient = useQueryClient();
  const reset = useWizardStore((s) => s.reset);
  const setError = useWizardStore((s) => s.setError);

  const mutation = useMutation({
    mutationFn: async ({ params, triggerRun }: { params: UpdateScheduleParams; triggerRun: boolean }) => {
      return fetchJson("/api/ingest/update-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload(params, triggerRun)),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduledIngestKeys.all });
      reset();
      router.push("/account/schedules");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("failedToUpdateSchedule"));
    },
  });

  const { mutate, isPending } = mutation;

  const updateSchedule = useCallback(
    (params: UpdateScheduleParams, triggerRun = false) => {
      setError(null);
      if (params.catalogId == null) {
        setError(t("pleaseSelectCatalog"));
        return;
      }
      mutate({ params, triggerRun });
    },
    [mutate, setError, t]
  );

  return { updateSchedule, isUpdating: isPending };
};
