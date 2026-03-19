/**
 * Shared error boundary UI for Next.js route error pages.
 *
 * Provides a consistent error display with retry button and optional
 * extra actions (e.g. "Start Over" link). Used by route-level
 * `error.tsx` files to avoid duplicating the same layout.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { logError } from "@/lib/logger";

interface RouteErrorBoundaryProps {
  error: Error;
  reset: () => void;
  title: string;
  description: string;
  tryAgainLabel: string;
  logContext: string;
  className?: string;
  children?: ReactNode;
}

export const RouteErrorBoundary = ({
  error,
  reset,
  title,
  description,
  tryAgainLabel,
  logContext,
  className = "h-full",
  children,
}: RouteErrorBoundaryProps) => {
  useEffect(() => {
    logError(error, logContext);
  }, [error, logContext]);

  return (
    <div className={`flex items-center justify-center p-8 ${className}`}>
      <div className="max-w-md space-y-4 text-center">
        <AlertTriangleIcon className="text-destructive mx-auto h-12 w-12" />
        <h2 className="text-cartographic-charcoal font-serif text-xl font-semibold">{title}</h2>
        <p className="text-cartographic-navy/70 text-sm">{description}</p>
        <div className="flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcwIcon className="mr-2 h-4 w-4" />
            {tryAgainLabel}
          </Button>
          {children}
        </div>
      </div>
    </div>
  );
};
