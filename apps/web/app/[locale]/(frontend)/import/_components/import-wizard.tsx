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
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { retrieveMappingData } from "@/lib/import/mapping-transfer";

import { StepAuth, StepDatasetSelection, StepFieldMapping, StepProcessing, StepReview, StepUpload } from "./steps";
import { useWizard, type WizardStep } from "./wizard-context";

export interface ImportWizardProps {
  /** Additional CSS classes */
  className?: string;
}

export const ImportWizard = ({ className }: Readonly<ImportWizardProps>) => {
  const { state, nextStep, setFieldMapping, setTransforms, goToStep, shouldAutoAdvance } = useWizard();
  const { currentStep } = state;
  const searchParams = useSearchParams();
  const router = useRouter();
  const prevShouldAdvance = useRef(false);

  // Apply field mappings returned from the visual flow editor via sessionStorage
  useEffect(() => {
    const mappingKey = searchParams.get("mappingKey");
    if (!mappingKey) return;

    const data = retrieveMappingData(mappingKey);
    if (data) {
      setFieldMapping(data.fieldMapping.sheetIndex, data.fieldMapping);
      if (data.transforms.length > 0) {
        setTransforms(data.fieldMapping.sheetIndex, data.transforms);
      }
    }

    const stepParam = searchParams.get("step");
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (step >= 1 && step <= 6) {
        goToStep(step as WizardStep);
      }
    }

    // Clean URL to prevent re-application on re-render
    router.replace("/import", { scroll: false });
  }, [searchParams, setFieldMapping, setTransforms, goToStep, router]);

  // Auto-advance: when step requirements are met, move to the next step
  // Only fires on false→true transition to prevent loops
  useEffect(() => {
    if (shouldAutoAdvance && !prevShouldAdvance.current) {
      const timer = setTimeout(() => nextStep(), 400);
      return () => clearTimeout(timer);
    }
    prevShouldAdvance.current = shouldAutoAdvance;
  }, [shouldAutoAdvance, nextStep]);

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
        return <StepReview />;
      case 6:
        return <StepProcessing />;
      default:
        return null;
    }
  };

  return <div className={cn("space-y-6", className)}>{renderStep()}</div>;
};
