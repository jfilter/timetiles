/**
 * Shared error and success feedback components for auth and account forms.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

/** Inline error message for form mutations. */
export const FormError = ({ error }: { error: Error | null }) => {
  if (!error) return null;
  return <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error.message}</div>;
};

interface FormSuccessProps {
  /** Whether to show the success feedback. */
  show: boolean;
  /** Simple text message (used for inline variant). */
  message?: string;
  /** Title text displayed as a heading (used for card variant). */
  title?: string;
  /** Rich description content below the title (used for card variant). */
  description?: React.ReactNode;
  /** Override the default check icon. Receives className for sizing. */
  icon?: LucideIcon;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

/**
 * Success feedback component with two display modes:
 *
 * - **Inline** (default): Green banner with check icon and a `message` string.
 *   Used inside forms for in-place confirmation.
 *
 * - **Card**: Centered card with large icon, `title`, and `description`.
 *   Activated when `title` is provided. Used for full-page success states
 *   like "check your email" after registration or password reset.
 */
export const FormSuccess = ({ show, message, title, description, icon: Icon, className }: FormSuccessProps) => {
  if (!show) return null;

  // Card variant: large centered feedback with icon, title, and description
  if (title) {
    const CardIcon = Icon ?? Check;
    return (
      <div className={cn("space-y-4 text-center", className)}>
        <div className="bg-primary/10 border-primary/20 rounded-sm border p-6">
          <CardIcon className="text-primary mx-auto mb-4 h-12 w-12" />
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <div className="text-muted-foreground mt-2 text-sm">{description}</div>}
        </div>
      </div>
    );
  }

  // Inline variant: compact green banner
  return (
    <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
      <Check className="h-4 w-4" />
      {message}
    </div>
  );
};
