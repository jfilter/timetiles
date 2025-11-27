/**
 * Navigation buttons for the import wizard.
 *
 * Provides Back and Next/Continue buttons for navigating between wizard steps.
 * Handles step validation and disabled states.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useWizard } from "./wizard-context";

export interface WizardNavigationProps {
  className?: string;
  /** Custom handler for the next button (overrides default nextStep) */
  onNext?: () => void | Promise<void>;
  /** Custom handler for the back button (overrides default prevStep) */
  onBack?: () => void;
  /** Custom text for the next button */
  nextLabel?: string;
  /** Whether to show the back button */
  showBack?: boolean;
  /** Whether to show the next button */
  showNext?: boolean;
  /** Whether the next action is loading */
  isLoading?: boolean;
}

export const WizardNavigation = ({
  className,
  onNext,
  onBack,
  nextLabel,
  showBack = true,
  showNext = true,
  isLoading = false,
}: Readonly<WizardNavigationProps>) => {
  const { state, nextStep, prevStep, reset, canProceed } = useWizard();
  const { currentStep } = state;
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === 6;

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      prevStep();
    }
  }, [onBack, prevStep]);

  const handleNext = useCallback(() => {
    if (onNext) {
      const result = onNext();
      if (result instanceof Promise) {
        result.catch(() => {
          // Error handled by the parent component
        });
      }
    } else {
      nextStep();
    }
  }, [onNext, nextStep]);

  // Determine next button label
  const buttonLabel = useMemo(() => {
    if (nextLabel) return nextLabel;
    if (currentStep === 5) return "Start Import";
    if (currentStep === 6) return "Done";
    return "Continue";
  }, [nextLabel, currentStep]);

  // Determine next button icon
  const buttonIcon = useMemo(() => {
    if (isLoading) return <Loader2Icon className="h-4 w-4 animate-spin" />;
    if (currentStep === 5) return <CheckIcon className="h-4 w-4" />;
    return <ArrowRightIcon className="h-4 w-4" />;
  }, [isLoading, currentStep]);

  const handleReset = useCallback(() => {
    reset();
    setShowResetConfirm(false);
  }, [reset]);

  const showConfirmDialog = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const hideConfirmDialog = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  return (
    <div className={cn("flex items-center justify-between border-t pt-6", className)} data-testid="wizard-navigation">
      <div className="flex items-center gap-4">
        {showBack && !isFirstStep && (
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
        {!isFirstStep && !isLastStep && (
          <>
            {showResetConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Reset wizard?</span>
                <Button type="button" variant="destructive" size="sm" onClick={handleReset}>
                  Yes
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={hideConfirmDialog}>
                  No
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={showConfirmDialog}
                disabled={isLoading}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcwIcon className="mr-1 h-3 w-3" />
                Start Over
              </Button>
            )}
          </>
        )}
      </div>

      <div>
        {showNext && !isLastStep && (
          <Button type="button" onClick={handleNext} disabled={!canProceed || isLoading}>
            {buttonLabel}
            <span className="ml-2">{buttonIcon}</span>
          </Button>
        )}
      </div>
    </div>
  );
};
