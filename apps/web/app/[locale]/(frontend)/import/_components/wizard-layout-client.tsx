/**
 * Full-screen wizard layout component.
 *
 * Takes over the viewport with a fixed overlay, hiding site nav and footer.
 * Renders a minimal header with back/close buttons and a thin progress bar.
 *
 * @module
 * @category Components
 */
"use client";

import { useEffect } from "react";

import { WizardProvider, type WizardProviderProps } from "./wizard-context";
import { WizardHeader } from "./wizard-progress";

interface WizardLayoutClientProps {
  children: React.ReactNode;
  initialAuth: WizardProviderProps["initialAuth"];
}

export const WizardLayoutClient = ({ children, initialAuth }: Readonly<WizardLayoutClientProps>) => {
  // Lock body scroll while wizard is mounted
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <WizardProvider initialAuth={initialAuth}>
      <div className="bg-background fixed inset-0 z-50 flex flex-col">
        <WizardHeader />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
        </main>
      </div>
    </WizardProvider>
  );
};
