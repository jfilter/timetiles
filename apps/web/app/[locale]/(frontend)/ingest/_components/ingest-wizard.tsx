/**
 * Import wizard step content component.
 *
 * Renders the appropriate step component based on current wizard state.
 * Handles auto-advance for steps 1-3 when their requirements are met.
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
import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { useScheduledImportQuery } from "@/lib/hooks/use-scheduled-ingest-query";

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
import { useWizardStore } from "./wizard-store";

export interface ImportWizardProps {
  /** Additional CSS classes */
  className?: string;
  /** ID of a scheduled ingest to edit (from ?edit= query parameter) */
  editScheduleId?: number | null;
}

export const IngestWizard = ({ className, editScheduleId }: Readonly<ImportWizardProps>) => {
  const t = useTranslations("Ingest");
  const currentStep = useWizardStore((s) => s.currentStep);
  const editMode = useWizardStore((s) => s.editMode);
  const initializeForEdit = useWizardStore((s) => s.initializeForEdit);
  const editInitializedRef = useRef<number | null>(null);
  const setError = useWizardStore((s) => s.setError);

  const router = useRouter();
  const { data: schedule, isLoading: isLoadingSchedule, isError } = useScheduledImportQuery(editScheduleId ?? null);

  // Initialize edit mode once the schedule is loaded
  useEffect(() => {
    if (editScheduleId && schedule && editInitializedRef.current !== editScheduleId) {
      editInitializedRef.current = editScheduleId;
      try {
        const editData = mapScheduleToEditData(schedule);
        initializeForEdit(editScheduleId, editData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schedule data");
      }
    }
  }, [editScheduleId, schedule, initializeForEdit, setError]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Show error state if schedule fetch failed
  if (editScheduleId && isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p className="text-destructive text-sm">{t("failedToLoadSchedule")}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/account/schedules")}>
          {t("back")}
        </Button>
      </div>
    );
  }

  // Show loading state while fetching schedule for edit
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
