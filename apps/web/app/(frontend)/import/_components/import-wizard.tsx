/**
 * Main import wizard component.
 *
 * Orchestrates the multi-step import process, rendering the appropriate
 * step component based on current wizard state.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useEffect } from "react";

import { StepAuth, StepDatasetSelection, StepFieldMapping, StepProcessing, StepReview, StepUpload } from "./steps";
import { useWizard, WizardProvider, type WizardProviderProps } from "./wizard-context";
import { WizardProgress } from "./wizard-progress";

interface WizardContentProps {
  className?: string;
}

const WizardContent = ({ className }: Readonly<WizardContentProps>) => {
  const { state } = useWizard();
  const { currentStep } = state;

  // Scroll to top when step changes
  useEffect(() => {
    // Small delay to ensure scroll happens after content renders and any focus events
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [currentStep]);

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
        return <StepReview />;
      case 6:
        return <StepProcessing />;
      default:
        return null;
    }
  };

  return (
    <div className={cn("mx-auto w-full max-w-4xl space-y-8", className)}>
      {/* Progress indicator */}
      <WizardProgress />

      {/* Step content */}
      <Card>
        <CardContent className="pt-6">{renderStep()}</CardContent>
      </Card>
    </div>
  );
};

export interface ImportWizardProps {
  /** Initial auth state from server */
  initialAuth?: WizardProviderProps["initialAuth"];
  /** Additional CSS classes */
  className?: string;
}

export const ImportWizard = ({ initialAuth, className }: Readonly<ImportWizardProps>) => {
  return (
    <WizardProvider initialAuth={initialAuth}>
      <WizardContent className={className} />
    </WizardProvider>
  );
};
