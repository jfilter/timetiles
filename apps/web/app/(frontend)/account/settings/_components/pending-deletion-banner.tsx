/**
 * Pending deletion banner component.
 *
 * Displays a warning banner when an account is scheduled for deletion,
 * with an option to cancel the deletion.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

interface PendingDeletionBannerProps {
  deletionScheduledAt: string;
  onCancelled: () => void;
}

export const PendingDeletionBanner = ({ deletionScheduledAt, onCancelled }: PendingDeletionBannerProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = useCallback(() => {
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch("/api/account/delete/cancel", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "Failed to cancel deletion");
        }

        onCancelled();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel deletion");
      } finally {
        setLoading(false);
      }
    })();
  }, [onCancelled]);

  const deletionDate = new Date(deletionScheduledAt);
  const daysRemaining = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="bg-destructive/10 border-destructive rounded-md border p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="text-destructive font-medium">Account Deletion Scheduled</h4>
            <p className="text-muted-foreground mt-1 text-sm">
              Your account is scheduled for deletion on <strong>{deletionDate.toLocaleDateString()}</strong>
              {daysRemaining > 0 && ` (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining)`}.
            </p>
          </div>
          {error && <p className="text-destructive text-sm font-medium">{error}</p>}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={loading}
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel Deletion
          </Button>
        </div>
      </div>
    </div>
  );
};
