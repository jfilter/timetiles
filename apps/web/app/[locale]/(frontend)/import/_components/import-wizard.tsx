/**
 * Import wizard step content component.
 *
 * Renders the appropriate step component based on current wizard state.
 * Handles auto-advance for steps 1-3 when their requirements are met.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { useEffect } from "react";

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
}

export const ImportWizard = ({ className }: Readonly<ImportWizardProps>) => {
  const currentStep = useWizardStore((s) => s.currentStep);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
