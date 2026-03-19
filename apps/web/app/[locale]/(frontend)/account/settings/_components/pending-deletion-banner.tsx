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
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { useCancelDeletionMutation } from "@/lib/hooks/use-account-mutations";

interface PendingDeletionBannerProps {
  deletionScheduledAt: string;
}

export const PendingDeletionBanner = ({ deletionScheduledAt }: PendingDeletionBannerProps) => {
  const t = useTranslations("Account");
  const router = useRouter();
  const cancelMutation = useCancelDeletionMutation();

  const handleCancel = () => {
    cancelMutation.mutate(undefined, { onSuccess: () => router.refresh() });
  };

  const loading = cancelMutation.isPending;
  const error = cancelMutation.error?.message ?? null;

  const deletionDate = new Date(deletionScheduledAt);
  const daysRemaining = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const remaining = daysRemaining > 0 ? t("daysRemaining", { count: daysRemaining }) : "";

  return (
    <div className="bg-destructive/10 border-destructive rounded-md border p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="text-destructive font-medium">{t("pendingDeletion")}</h4>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.rich("pendingDeletionMessage", {
                date: deletionDate.toLocaleDateString(),
                remaining,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
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
            {t("cancelDeletion")}
          </Button>
        </div>
      </div>
    </div>
  );
};
