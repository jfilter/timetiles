/**
 * Import wizard step content component.
 *
 * Renders the appropriate step component based on current wizard state.
 * The wizard layout (progress, navigation) is handled by the parent layout.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { useEffect, useRef } from "react";

import { StepAuth, StepDatasetSelection, StepFieldMapping, StepProcessing, StepReview, StepUpload } from "./steps";
import { useWizard } from "./wizard-context";

export interface ImportWizardProps {
  /** Additional CSS classes */
  className?: string;
}

export const ImportWizard = ({ className }: Readonly<ImportWizardProps>) => {
  const { state } = useWizard();
  const { currentStep } = state;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to top of content area when step changes
  useEffect(() => {
    const timer = setTimeout(() => {
      // Find the scrollable parent (the overflow-y-auto container in the layout)
      const scrollContainer = scrollContainerRef.current?.closest(".overflow-y-auto");
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      }
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
    <div ref={scrollContainerRef} className={cn("space-y-6", className)}>
      {renderStep()}
    </div>
  );
};
