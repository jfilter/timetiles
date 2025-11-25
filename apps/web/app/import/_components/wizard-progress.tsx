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

const STEPS: Array<{ step: WizardStep; label: string; shortLabel: string }> = [
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
  isCompleted: boolean;
  isCurrent: boolean;
  isClickable: boolean;
  onNavigate: (step: WizardStep) => void;
}

const StepButton = ({ step, isCompleted, isCurrent, isClickable, onNavigate }: Readonly<StepButtonProps>) => {
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
      {isCompleted ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <span>{step}</span>}
    </button>
  );
};

export const WizardProgress = ({ className }: Readonly<WizardProgressProps>) => {
  const { state, goToStep } = useWizard();
  const { currentStep } = state;

  const canNavigateTo = useMemo(() => {
    // Can navigate back to any completed step
    // Cannot skip ahead
    return (step: WizardStep) => step < currentStep;
  }, [currentStep]);

  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between">
        {STEPS.map((stepInfo, index) => {
          const isCompleted = stepInfo.step < currentStep;
          const isCurrent = stepInfo.step === currentStep;
          const isClickable = canNavigateTo(stepInfo.step);

          return (
            <li key={stepInfo.step} className="relative flex flex-1 items-center">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    "absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2",
                    isCompleted || isCurrent ? "bg-primary" : "bg-border"
                  )}
                  aria-hidden="true"
                />
              )}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Step indicator */}
              <div className="relative flex flex-col items-center">
                <StepButton
                  step={stepInfo.step}
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
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
