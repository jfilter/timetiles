/**
 * Progress indicator for the import wizard.
 *
 * Displays the current step and progress through the 6-step wizard.
 * Uses visual indicators to show completed, current, and upcoming steps.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { useWizard, type WizardStep } from "./wizard-context";

const ALL_STEPS: Array<{ step: WizardStep; label: string; shortLabel: string }> = [
  { step: 1, label: "Sign In", shortLabel: "Auth" },
  { step: 2, label: "Upload", shortLabel: "Upload" },
  { step: 3, label: "Dataset", shortLabel: "Dataset" },
  { step: 4, label: "Mapping", shortLabel: "Map" },
  { step: 5, label: "Review", shortLabel: "Review" },
  { step: 6, label: "Import", shortLabel: "Import" },
];

export interface WizardProgressProps {
  className?: string;
}

interface StepButtonProps {
  step: WizardStep;
  displayNumber: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isClickable: boolean;
  onNavigate: (step: WizardStep) => void;
}

const StepButton = ({
  step,
  displayNumber,
  isCompleted,
  isCurrent,
  isClickable,
  onNavigate,
}: Readonly<StepButtonProps>) => {
  const handleClick = useCallback(() => {
    if (isClickable) {
      onNavigate(step);
    }
  }, [isClickable, onNavigate, step]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isClickable}
      className={cn(
        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
        isCompleted && "border-primary bg-primary text-primary-foreground",
        isCurrent && "border-primary bg-background text-primary",
        !isCompleted && !isCurrent && "border-border bg-background text-muted-foreground",
        isClickable && "hover:bg-primary/10 cursor-pointer",
        !isClickable && "cursor-default"
      )}
      aria-current={isCurrent ? "step" : undefined}
    >
      {isCompleted ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <span>{displayNumber}</span>}
    </button>
  );
};

export const WizardProgress = ({ className }: Readonly<WizardProgressProps>) => {
  const { state, goToStep } = useWizard();
  const { currentStep, startedAuthenticated } = state;

  // Hide auth step only if user was already authenticated when they started the wizard
  // (not if they logged in during the wizard flow)
  const skipAuthStep = startedAuthenticated;
  const visibleSteps = useMemo(
    () => (skipAuthStep ? ALL_STEPS.filter((s) => s.step !== 1) : ALL_STEPS),
    [skipAuthStep]
  );

  const canNavigateTo = useMemo(() => {
    // Can navigate back to any completed step
    // Cannot skip ahead
    // Cannot navigate during processing (step 6)
    // Cannot navigate to auth step if skipped
    return (step: WizardStep) => step < currentStep && currentStep !== 6 && !(skipAuthStep && step === 1);
  }, [currentStep, skipAuthStep]);

  // Calculate progress based on visible steps
  const currentStepIndex = visibleSteps.findIndex((s) => s.step === currentStep);
  const progressPercent = (currentStepIndex / (visibleSteps.length - 1)) * 100;
  const progressLineStyle = useMemo(
    () => ({ width: `calc(${progressPercent}% - 32px + ${progressPercent}% * 32px / 100%)` }),
    [progressPercent]
  );

  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      {/* Container with the line behind steps */}
      <div className="relative">
        {/* Background line (full width, inactive color) */}
        <div className="bg-border absolute top-4 right-0 left-0 mx-[16px] h-0.5" aria-hidden="true" />
        {/* Progress line (active color, width based on progress) */}
        <div
          className="bg-primary absolute top-4 left-0 mx-[16px] h-0.5 transition-all duration-300"
          style={progressLineStyle}
          aria-hidden="true"
        />

        {/* Steps */}
        <ol className="relative flex items-center justify-between">
          {visibleSteps.map((stepInfo, index) => {
            const isCompleted = stepInfo.step < currentStep;
            const isCurrent = stepInfo.step === currentStep;
            const isClickable = canNavigateTo(stepInfo.step);
            const displayNumber = index + 1;

            return (
              <li key={stepInfo.step} className="flex flex-col items-center">
                <StepButton
                  step={stepInfo.step}
                  displayNumber={displayNumber}
                  isCompleted={isCompleted}
                  isCurrent={isCurrent}
                  isClickable={isClickable}
                  onNavigate={goToStep}
                />

                {/* Label */}
                <span
                  className={cn(
                    "mt-2 text-xs font-medium",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                    "hidden sm:block"
                  )}
                >
                  {stepInfo.label}
                </span>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                    "sm:hidden"
                  )}
                >
                  {stepInfo.shortLabel}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};
