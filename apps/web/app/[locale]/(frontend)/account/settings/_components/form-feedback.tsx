/**
 * Shared error and success feedback components for account settings forms.
 *
 * @module
 * @category Components
 */
import { Check } from "lucide-react";

/** Inline error message for form mutations. */
export const FormError = ({ error }: { error: Error | null }) => {
  if (!error) return null;
  return <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error.message}</div>;
};

/** Inline success message with check icon. */
export const FormSuccess = ({ show, message }: { show: boolean; message: string }) => {
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
      <Check className="h-4 w-4" />
      {message}
    </div>
  );
};
