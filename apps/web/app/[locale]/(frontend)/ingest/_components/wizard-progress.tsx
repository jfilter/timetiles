/**
 * Minimal header for the full-screen import wizard.
 *
 * Displays a back button, step indicator ("Step N of M"), close button,
 * and a thin progress bar. Replaces the old multi-circle step progress.
 * In edit mode, hides step 7 (Processing) and navigates to schedules on close.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

import { useWizardStore, WIZARD_STEPS } from "./wizard-store";

export const WizardHeader = () => {
  const t = useTranslations("Ingest");
  const router = useRouter();
  const currentStep = useWizardStore((s) => s.currentStep);
  const startedAuthenticated = useWizardStore((s) => s.startedAuthenticated);
  const editMode = useWizardStore((s) => s.editMode);
  const prevStep = useWizardStore((s) => s.prevStep);
  const reset = useWizardStore((s) => s.reset);

  const skipAuthStep = startedAuthenticated;
  let visibleSteps = skipAuthStep ? WIZARD_STEPS.filter((s) => s.step !== 1) : WIZARD_STEPS;
  // In edit mode, hide the Processing step (step 7)
  if (editMode) {
    visibleSteps = visibleSteps.filter((s) => s.step !== 7);
  }
  const currentIndex = visibleSteps.findIndex((s) => s.step === currentStep);
  const totalSteps = visibleSteps.length;
  const progressPercent = ((currentIndex + 1) / totalSteps) * 100;

  const canGoBack = currentStep > (skipAuthStep ? 2 : 1) && currentStep !== 7;
  const currentLabel = visibleSteps[currentIndex]?.label ?? "";

  const handleClose = () => {
    if (editMode) {
      reset();
      router.push("/account/schedules");
    } else {
      router.back();
    }
  };

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Back button */}
        <div className="w-20">
          {canGoBack && (
            <Button variant="ghost" size="sm" onClick={prevStep} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t("back")}</span>
            </Button>
          )}
        </div>

        {/* Step indicator */}
        <div className="text-muted-foreground text-center text-sm font-medium">
          {editMode && <span className="text-primary mr-2 hidden sm:inline">{t("editMode")}</span>}
          <span>{t("stepOfTotal", { current: currentIndex + 1, total: totalSteps })}</span>
          <span className="text-foreground ml-2 hidden sm:inline">{currentLabel}</span>
        </div>

        {/* Close button */}
        <div className="flex w-20 justify-end">
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
            <X className="h-4 w-4" />
            <span className="sr-only">{t("exitWizard")}</span>
          </Button>
        </div>
      </div>

      {/* Thin progress bar */}
      <div className="bg-muted h-0.5 w-full">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </header>
  );
};
