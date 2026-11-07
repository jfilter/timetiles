/**
 * Import wizard step content component.
 *
 * Renders the appropriate step component based on current wizard state.
 * Each step requires an explicit user action (Continue button) to proceed.
 * Supports edit mode for updating existing scheduled ingests.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { useScheduledIngestQuery } from "@/lib/hooks/use-scheduled-ingest-query";
import type { ScheduledIngest } from "@/payload-types";

import { mapScheduleToEditData } from "./edit-schedule-mapper";
import {
  StepAuth,
  StepDatasetSelection,
  StepFieldMapping,
  StepProcessing,
  StepReview,
  StepSchedule,
  StepUpload,
} from "./steps";
import type { EditScheduleData } from "./wizard-state";
import { useWizardStore } from "./wizard-store";

export interface IngestWizardProps {
  /** Additional CSS classes */
  className?: string;
  /** ID of a scheduled ingest to edit (from ?edit= query parameter) */
  editScheduleId?: number | null;
}

/** Map a fetched schedule to edit state; `null` when the mapper rejects it (its catalog is gone). */
const toEditData = (schedule: ScheduledIngest): EditScheduleData | null => {
  try {
    return mapScheduleToEditData(schedule);
  } catch {
    return null;
  }
};

export const IngestWizard = ({ className, editScheduleId }: Readonly<IngestWizardProps>) => {
  const t = useTranslations("Ingest");
  const currentStep = useWizardStore((s) => s.currentStep);
  const editMode = useWizardStore((s) => s.editMode);
  const initializeForEdit = useWizardStore((s) => s.initializeForEdit);
  const editInitializedRef = useRef<number | null>(null);
  const reset = useWizardStore((s) => s.reset);

  const router = useRouter();
  const { data: schedule, isLoading: isLoadingSchedule, isError } = useScheduledIngestQuery(editScheduleId ?? null);
  const editData = useMemo(() => (schedule ? toEditData(schedule) : undefined), [schedule]);

  // `?edit=N` loads a schedule the user owns. The loading state below blocks
  // rendering until init runs, the per-id ref guard runs it exactly once, and
  // `initializeForEdit` is a single atomic `set()` that clears persisted state.
  useEffect(() => {
    if (editScheduleId && editData && editInitializedRef.current !== editScheduleId) {
      editInitializedRef.current = editScheduleId;
      initializeForEdit(editScheduleId, editData);
    }
  }, [editScheduleId, editData, initializeForEdit]);

  // Without `?edit=`, an edit session left behind by browser navigation must not carry over.
  useEffect(() => {
    if (editScheduleId) return;
    editInitializedRef.current = null;
    if (editMode) reset();
  }, [editScheduleId, editMode, reset]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  if (editScheduleId && (isError || editData === null)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p role="alert" className="text-destructive text-sm">
          {isError ? t("failedToLoadSchedule") : t("scheduleNotEditable")}
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push("/account/imports?tab=scheduled")}>
          {t("back")}
        </Button>
      </div>
    );
  }

  if (!editScheduleId && editMode) return null;

  if (editScheduleId && (isLoadingSchedule || !editMode)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        <p className="text-muted-foreground text-sm">{t("loadingSchedule")}</p>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepAuth />;
      case 2:
        return <StepUpload />;
      case 3:
        return <StepDatasetSelection />;
      case 4:
        return <StepFieldMapping />;
      case 5:
        return <StepSchedule />;
      case 6:
        return <StepReview />;
      case 7:
        return <StepProcessing />;
      default:
        return null;
    }
  };

  return <div className={cn("space-y-6", className)}>{renderStep()}</div>;
};
