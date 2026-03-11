/**
 * Error state for event detail content.
 *
 * @module
 * @category Components
 */
import { ContentState } from "@timetiles/ui";
import { AlertTriangle } from "lucide-react";

/** Error display for event detail loading failures, with not-found detection */
export const EventDetailError = ({ error, onRetry }: { error: Error | null; onRetry?: () => void }) => {
  const isNotFound = error?.message?.includes("not found");
  return (
    <ContentState
      variant="error"
      icon={
        <div className="bg-destructive/10 rounded-full p-4">
          <AlertTriangle className="text-destructive h-8 w-8" />
        </div>
      }
      title={isNotFound ? "Event Not Found" : "Failed to Load Event"}
      subtitle={
        isNotFound
          ? "This event may have been deleted or you don't have permission to view it."
          : "There was a problem loading the event details. Please try again."
      }
      onRetry={isNotFound ? undefined : onRetry}
      className="py-12"
    />
  );
};
