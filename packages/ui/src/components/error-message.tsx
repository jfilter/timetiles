/**
 * Shared error message component with multiple display variants.
 *
 * Provides consistent error display patterns across the application,
 * from simple inline text to styled containers with icons.
 *
 * @module
 * @category Components
 */
import { AlertCircle } from "lucide-react";

import { cn } from "../lib/utils";

export interface ErrorMessageProps {
  /** The error message to display */
  message: string;
  /** Display variant */
  variant?: "inline" | "box";
  /** Optional retry callback */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Error message component with inline and box variants.
 *
 * @example
 * ```tsx
 * <ErrorMessage message="Failed to load" />
 * <ErrorMessage variant="box" message="Something went wrong" onRetry={refetch} />
 * ```
 */
export const ErrorMessage = ({ message, variant = "inline", onRetry, className }: ErrorMessageProps) => {
  if (variant === "box") {
    return (
      <div className={cn("bg-destructive/10 text-destructive rounded-md p-4", className)} role="alert">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{message}</p>
            {onRetry != null && (
              <button
                type="button"
                onClick={onRetry}
                className="text-destructive hover:text-destructive/80 mt-2 text-sm font-medium underline"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: inline variant
  return (
    <p className={cn("text-destructive text-sm", className)} role="alert">
      {message}
    </p>
  );
};
