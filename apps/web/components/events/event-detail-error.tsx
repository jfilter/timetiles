/**
 * Error state for event detail content.
 *
 * @module
 * @category Components
 */
import { ContentState } from "@timetiles/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

/** Error display for event detail loading failures, with not-found detection */
export const EventDetailError = ({ error, onRetry }: { error: Error | null; onRetry?: () => void }) => {
  const t = useTranslations("Events");
  const isNotFound = error?.message?.includes("not found");
  return (
    <ContentState
      variant="error"
      icon={
        <div className="bg-destructive/10 rounded-full p-4">
          <AlertTriangle className="text-destructive h-8 w-8" />
        </div>
      }
      title={isNotFound ? t("eventNotFound") : t("failedToLoad")}
      subtitle={isNotFound ? t("eventNotFoundDescription") : t("failedToLoadDescription")}
      onRetry={isNotFound ? undefined : onRetry}
      className="py-12"
    />
  );
};
