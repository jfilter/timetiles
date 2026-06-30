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

import { Button, Input, Label } from "@timetiles/ui";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { useCancelDeletionMutation } from "@/lib/hooks/use-account-mutations";
import { useMounted } from "@/lib/hooks/use-theme";

interface PendingDeletionBannerProps {
  deletionScheduledAt: string;
}

export const PendingDeletionBanner = ({ deletionScheduledAt }: PendingDeletionBannerProps) => {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const cancelMutation = useCancelDeletionMutation();
  const [password, setPassword] = useState("");

  // The route requires the current password (matching schedule-deletion), so the
  // banner must collect it; without it the request always failed with 422.
  const handleCancel = () => {
    if (!password) return;
    cancelMutation.mutate(password, { onSuccess: () => router.refresh() });
  };

  const loading = cancelMutation.isPending;
  const error = cancelMutation.error?.message ?? null;

  // Date.now() and toLocaleDateString() depend on the runtime clock + timezone,
  // which differ between the SSR render and client hydration and would cause a
  // hydration mismatch (the banner is server-rendered from the user prop).
  // Compute the time-derived display only after mount; SSR and the first client
  // render show neutral values, then the real local values fill in.
  const mounted = useMounted();
  const deletionDate = new Date(deletionScheduledAt);
  const formattedDate = mounted ? deletionDate.toLocaleDateString() : "";
  const daysRemaining = mounted
    ? Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

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
                date: formattedDate,
                remaining,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
          {error && <p className="text-destructive text-sm font-medium">{error}</p>}
          <div className="max-w-xs space-y-1">
            <Label htmlFor="cancel-deletion-password">{tCommon("password")}</Label>
            <Input
              id="cancel-deletion-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={loading || !password}
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
