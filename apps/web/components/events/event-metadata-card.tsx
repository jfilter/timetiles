/**
 * Event metadata card for the page variant.
 *
 * @module
 * @category Components
 */
import { Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";

import { formatDate } from "@/lib/utils/date";
import type { Event } from "@/payload-types";

/** Displays event metadata (created, updated, validation, import batch) in a card layout */
export const EventMetadataCard = ({ event }: { event: Event }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">Metadata</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Created</p>
          <p>{formatDate(event.createdAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Updated</p>
          <p>{formatDate(event.updatedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Validation</p>
          <p
            className={cn(
              event.validationStatus === "valid" && "text-cartographic-forest",
              event.validationStatus !== "valid" && "text-destructive"
            )}
          >
            {event.validationStatus === "valid" ? "Valid" : "Invalid"}
          </p>
        </div>
        {event.importBatch != null && (
          <div>
            <p className="text-muted-foreground">Import Batch</p>
            <p>{event.importBatch}</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);
