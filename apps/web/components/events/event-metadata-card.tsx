/**
 * Event metadata card for the page variant.
 *
 * @module
 * @category Components
 */
import { Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";

import { formatDate } from "@/lib/utils/date";
import type { Event } from "@/payload-types";

/** Displays event metadata (created, updated, validation, import batch) in a card layout */
export const EventMetadataCard = ({ event }: { event: Event }) => {
  const t = useTranslations("Events");

  return (
    <Card variant="ghost" padding="sm">
      <CardContent className="p-4">
        <h4 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">{t("metadata")}</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("created")}</p>
            <p>{formatDate(event.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("updated")}</p>
            <p>{formatDate(event.updatedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("validation")}</p>
            <p
              className={cn(
                event.validationStatus === "valid" && "text-accent",
                event.validationStatus !== "valid" && "text-destructive"
              )}
            >
              {event.validationStatus === "valid" ? t("valid") : t("invalid")}
            </p>
          </div>
          {event.ingestBatch != null && (
            <div>
              <p className="text-muted-foreground">{t("importBatch")}</p>
              <p>{event.ingestBatch}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
