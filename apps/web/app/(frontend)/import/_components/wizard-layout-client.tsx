/**
 * Client-side wizard layout component.
 *
 * Renders the fixed header (progress) and footer (navigation) with
 * scrollable content in between. Uses wizard context for state.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent } from "@timetiles/ui";

import { WizardProvider, type WizardProviderProps } from "./wizard-context";
import { WizardNavigation } from "./wizard-navigation";
import { WizardProgress } from "./wizard-progress";

interface WizardLayoutClientProps {
  children: React.ReactNode;
  initialAuth: WizardProviderProps["initialAuth"];
}

export const WizardLayoutClient = ({ children, initialAuth }: Readonly<WizardLayoutClientProps>) => {
  return (
    <WizardProvider initialAuth={initialAuth}>
      <div className="bg-background flex h-[calc(100vh-4rem)] flex-col">
        {/* Fixed top - progress indicator */}
        <div className="bg-background shrink-0 border-b">
          <div className="mx-auto max-w-4xl px-6 py-4">
            <WizardProgress />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8">
            <Card>
              <CardContent className="pt-6">{children}</CardContent>
            </Card>
          </div>
        </div>

        {/* Fixed bottom - navigation */}
        <div className="bg-background shrink-0 border-t">
          <div className="mx-auto max-w-4xl px-6 py-4">
            <WizardNavigation />
          </div>
        </div>
      </div>
    </WizardProvider>
  );
};
