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
import { useTranslations } from "next-intl";
import { useState } from "react";

import { STEP_NAV_CONFIGS } from "./step-nav-configs";
import { useWizard } from "./wizard-context";

export interface WizardNavigationProps {
  className?: string;
}

export const WizardNavigation = ({ className }: Readonly<WizardNavigationProps>) => {
  const t = useTranslations("Import");
  const tCommon = useTranslations("Common");
  const { state, nextStep, prevStep, reset, canProceed } = useWizard();
  const { currentStep, startedAuthenticated, navigationConfig } = state;

  // Merge static per-step config with any dynamic config set at runtime
  const {
    onNext: configOnNext,
    nextLabel: configNextLabel,
    isLoading = false,
    showBack = true,
    showNext = true,
  } = { ...STEP_NAV_CONFIGS[currentStep], ...navigationConfig };
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // First visible step is 2 (Upload) if user started authenticated, otherwise 1 (Sign In)
  const isFirstVisibleStep = startedAuthenticated ? currentStep === 2 : currentStep === 1;
  const isLastStep = currentStep === 6;

  const handleBack = () => {
    prevStep();
  };

  const handleNext = () => {
    if (configOnNext) {
      void (async () => {
        try {
          await configOnNext();
        } catch {
          // Error handled by the step component
        }
      })();
    } else {
      nextStep();
    }
  };

  // Determine next button label
  const buttonLabel = (() => {
    if (configNextLabel) return configNextLabel;
    if (currentStep === 5) return t("startImport");
    if (currentStep === 6) return tCommon("done");
    return tCommon("continue");
  })();

  // Determine next button icon
  const buttonIcon = (() => {
    if (isLoading) return <Loader2Icon className="h-4 w-4 animate-spin" />;
    if (currentStep === 5) return <CheckIcon className="h-4 w-4" />;
    return <ArrowRightIcon className="h-4 w-4" />;
  })();

  const handleReset = () => {
    reset();
    setShowResetConfirm(false);
  };

  const showConfirmDialog = () => {
    setShowResetConfirm(true);
  };

  const hideConfirmDialog = () => {
    setShowResetConfirm(false);
  };

  return (
    <div className={cn("flex items-center justify-between border-t pt-6", className)} data-testid="wizard-navigation">
      <div className="flex items-center gap-4">
        {showBack && !isFirstVisibleStep && (
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
        )}
        {currentStep > 2 && !isLastStep && (
          <>
            {showResetConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{t("resetWizardConfirm")}</span>
                <Button type="button" variant="destructive" size="sm" onClick={handleReset}>
                  {t("yes")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={hideConfirmDialog}>
                  {t("no")}
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
                {tCommon("startOver")}
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
