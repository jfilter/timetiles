/**
 * Delete account modal component.
 *
 * Multi-step modal for account deletion with data summary and confirmation.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@timetiles/ui";
import { AlertTriangle, Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/constants/account-constants";
import { useDeletionSummaryQuery, useScheduleDeletionMutation } from "@/lib/hooks/use-account-mutations";

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeletionScheduled: () => void;
}

type Step = "summary" | "confirm" | "success";

// oxlint-disable-next-line complexity -- multi-step modal with inherent branching
export const DeleteAccountModal = ({ open, onOpenChange, onDeletionScheduled }: DeleteAccountModalProps) => {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const [step, setStep] = useState<Step>("summary");
  const [password, setPassword] = useState("");
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<string | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  // Fetch deletion summary when modal is open and on the summary step
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useDeletionSummaryQuery({ enabled: open && step === "summary" });

  const scheduleDeletionMutation = useScheduleDeletionMutation();

  // Derive summary and error from query data
  const summary = summaryData?.canDelete ? summaryData.summary : null;

  const getSummaryDisplayError = (): string | null => {
    if (summaryError) {
      return summaryError instanceof Error ? summaryError.message : t("failedToLoad");
    }
    if (summaryData && !summaryData.canDelete) {
      return summaryData.reason ?? t("cannotDelete");
    }
    return null;
  };
  const summaryDisplayError = getSummaryDisplayError();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("summary");
      setPassword("");
      setDeletionScheduledAt(null);
      setDeletionError(null);
      scheduleDeletionMutation.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only reset on open change

  // When closing from success step, notify parent to refresh user data
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && step === "success") {
      onDeletionScheduled();
    }
    onOpenChange(newOpen);
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  const handleSetStepConfirm = () => {
    setStep("confirm");
  };

  const handleSetStepSummary = () => {
    setStep("summary");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleScheduleDeletion = () => {
    if (!password) {
      setDeletionError(t("passwordRequired"));
      return;
    }

    setDeletionError(null);

    void (async () => {
      try {
        const data = await scheduleDeletionMutation.mutateAsync({ password });
        setDeletionScheduledAt(data.deletionScheduledAt);
        setStep("success");
      } catch (err) {
        setDeletionError(err instanceof Error ? err.message : t("failedToScheduleDeletion"));
      }
    })();
  };

  const loading = step === "summary" ? isSummaryLoading : scheduleDeletionMutation.isPending;
  const error = step === "summary" ? summaryDisplayError : deletionError;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "success" ? (
              <>
                <Check className="h-5 w-5 text-green-600" />
                {t("deletionScheduled")}
              </>
            ) : (
              <>
                <AlertTriangle className="text-destructive h-5 w-5" />
                {t("deleteYourAccount")}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "summary" && t("deletionSummaryDescription")}
            {step === "confirm" && t("confirmDeletionDescription")}
            {step === "success" && t("deletionScheduledDescription")}
          </DialogDescription>
        </DialogHeader>

        {step === "summary" && (
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}

            {error && <div className="bg-destructive/10 text-destructive rounded-md p-4">{error}</div>}

            {summary && !loading && (
              <>
                <div className="bg-muted rounded-md p-4">
                  <h4 className="mb-2 font-medium">{t("dataSummary")}</h4>
                  <div className="text-muted-foreground space-y-1 text-sm">
                    <p>
                      {t("catalogsCount", {
                        total: summary.catalogs.public + summary.catalogs.private,
                        public: summary.catalogs.public,
                        private: summary.catalogs.private,
                      })}
                    </p>
                    <p>
                      {t("datasetsCount", {
                        total: summary.datasets.public + summary.datasets.private,
                        public: summary.datasets.public,
                        private: summary.datasets.private,
                      })}
                    </p>
                    <p>
                      {t("eventsCount", { total: summary.events.inPublicDatasets + summary.events.inPrivateDatasets })}
                    </p>
                    <p>{t("scheduledImportsCount", { count: summary.scheduledImports })}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="mt-0.5 h-5 w-5 text-green-600" />
                    <div>
                      <h5 className="font-medium">{t("publicDataTransfer")}</h5>
                      <p className="text-muted-foreground text-sm">
                        {t("publicDataTransferDescription", {
                          catalogs: summary.catalogs.public,
                          datasets: summary.datasets.public,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Trash2 className="text-destructive mt-0.5 h-5 w-5" />
                    <div>
                      <h5 className="font-medium">{t("privateDataDelete")}</h5>
                      <p className="text-muted-foreground text-sm">
                        {t("privateDataDeleteDescription", {
                          catalogs: summary.catalogs.private,
                          datasets: summary.datasets.private,
                          events: summary.events.inPrivateDatasets,
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-amber-50 p-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="text-sm">
                    <strong>{t("gracePeriod")}</strong>
                    {t("gracePeriodDescription")}
                  </p>
                </div>
              </>
            )}

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={handleClose}>
                {tCommon("cancel")}
              </Button>
              <Button variant="destructive" onClick={handleSetStepConfirm} disabled={loading || !summary}>
                {tCommon("continue")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            {error && <div className="bg-destructive/10 text-destructive rounded-md p-4">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="password">{tCommon("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder={t("enterPassword")}
                disabled={loading}
              />
            </div>

            <div className="bg-destructive/10 rounded-md p-4">
              <p className="text-destructive text-sm">{t("deleteConfirmation")}</p>
              <ul className="text-destructive mt-2 list-inside list-disc text-sm">
                <li>{t("deletePoint1")}</li>
                <li>{t("deletePoint2")}</li>
                <li>{t("deletePoint3")}</li>
              </ul>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={handleSetStepSummary} disabled={loading}>
                {tCommon("back")}
              </Button>
              <Button variant="destructive" onClick={handleScheduleDeletion} disabled={loading || !password}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("deleteMyAccount")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t.rich("deletionScheduledFor", {
                date: new Date(
                  deletionScheduledAt ?? Date.now() + DELETION_GRACE_PERIOD_DAYS * 86_400_000
                ).toLocaleDateString(),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>

            <div className="bg-muted rounded-md p-4">
              <p className="text-sm">{t("deletionCancelInfo")}</p>
            </div>

            <DialogFooter className="pt-4">
              <Button onClick={handleClose}>{tCommon("close")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
