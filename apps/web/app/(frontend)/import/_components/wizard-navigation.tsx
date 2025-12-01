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
}

export const WizardNavigation = ({ className }: Readonly<WizardNavigationProps>) => {
  const { state, nextStep, prevStep, reset, canProceed, navigationConfig } = useWizard();
  const { currentStep, startedAuthenticated } = state;

  // Get config from context (steps set this via setNavigationConfig)
  const {
    onNext: configOnNext,
    nextLabel: configNextLabel,
    isLoading = false,
    showBack = true,
    showNext = true,
  } = navigationConfig;
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // First visible step is 2 (Upload) if user started authenticated, otherwise 1 (Sign In)
  const isFirstVisibleStep = startedAuthenticated ? currentStep === 2 : currentStep === 1;
  const isLastStep = currentStep === 6;

  const handleBack = useCallback(() => {
    prevStep();
  }, [prevStep]);

  const handleNext = useCallback(() => {
    if (configOnNext) {
      const result = configOnNext();
      if (result instanceof Promise) {
        result.catch(() => {
          // Error handled by the step component
        });
      }
    } else {
      nextStep();
    }
  }, [configOnNext, nextStep]);

  // Determine next button label
  const buttonLabel = useMemo(() => {
    if (configNextLabel) return configNextLabel;
    if (currentStep === 5) return "Start Import";
    if (currentStep === 6) return "Done";
    return "Continue";
  }, [configNextLabel, currentStep]);

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
        {showBack && !isFirstVisibleStep && (
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
        {currentStep > 2 && !isLastStep && (
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
