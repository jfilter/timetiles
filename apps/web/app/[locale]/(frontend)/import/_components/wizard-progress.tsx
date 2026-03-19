/**
 * Minimal header for the full-screen import wizard.
 *
 * Displays a back button, step indicator ("Step N of M"), close button,
 * and a thin progress bar. Replaces the old multi-circle step progress.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useWizard } from "./wizard-context";
import { WIZARD_STEPS } from "./wizard-reducer";

export const WizardHeader = () => {
  const t = useTranslations("Import");
  const router = useRouter();
  const { state, prevStep } = useWizard();
  const { currentStep, startedAuthenticated } = state;

  const skipAuthStep = startedAuthenticated;
  const visibleSteps = skipAuthStep ? WIZARD_STEPS.filter((s) => s.step !== 1) : WIZARD_STEPS;
  const currentIndex = visibleSteps.findIndex((s) => s.step === currentStep);
  const totalSteps = visibleSteps.length;
  const progressPercent = ((currentIndex + 1) / totalSteps) * 100;

  const canGoBack = currentStep > (skipAuthStep ? 2 : 1) && currentStep !== 6;
  const currentLabel = visibleSteps[currentIndex]?.label ?? "";

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
          <span>{t("stepOfTotal", { current: currentIndex + 1, total: totalSteps })}</span>
          <span className="text-foreground ml-2 hidden sm:inline">{currentLabel}</span>
        </div>

        {/* Close button */}
        <div className="flex w-20 justify-end">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
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

// Keep old export name for backward compat during transition
export { WizardHeader as WizardProgress };
export type WizardProgressProps = Record<string, never>;
