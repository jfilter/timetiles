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
import { useEffect, useState } from "react";

import { useDeletionSummaryQuery, useScheduleDeletionMutation } from "@/lib/hooks/use-account-mutations";

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeletionScheduled: () => void;
}

type Step = "summary" | "confirm" | "success";

// oxlint-disable-next-line complexity -- multi-step modal with inherent branching
export const DeleteAccountModal = ({ open, onOpenChange, onDeletionScheduled }: DeleteAccountModalProps) => {
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
      return summaryError instanceof Error ? summaryError.message : "Failed to load data";
    }
    if (summaryData && !summaryData.canDelete) {
      return summaryData.reason ?? "Cannot delete account";
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
      setDeletionError("Password is required");
      return;
    }

    setDeletionError(null);

    void (async () => {
      try {
        const data = await scheduleDeletionMutation.mutateAsync({ password });
        setDeletionScheduledAt(data.deletionScheduledAt);
        setStep("success");
      } catch (err) {
        setDeletionError(err instanceof Error ? err.message : "Failed to schedule deletion");
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
                Deletion Scheduled
              </>
            ) : (
              <>
                <AlertTriangle className="text-destructive h-5 w-5" />
                Delete Your Account
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "summary" && "Review what will happen to your data before proceeding."}
            {step === "confirm" && "Enter your password to schedule account deletion."}
            {step === "success" && "Your account deletion has been scheduled."}
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
                  <h4 className="mb-2 font-medium">Your Data Summary</h4>
                  <div className="text-muted-foreground space-y-1 text-sm">
                    <p>
                      Catalogs: {summary.catalogs.public + summary.catalogs.private} ({summary.catalogs.public} public,{" "}
                      {summary.catalogs.private} private)
                    </p>
                    <p>
                      Datasets: {summary.datasets.public + summary.datasets.private} ({summary.datasets.public} public,{" "}
                      {summary.datasets.private} private)
                    </p>
                    <p>Events: {summary.events.inPublicDatasets + summary.events.inPrivateDatasets} total</p>
                    <p>Scheduled Imports: {summary.scheduledImports}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="mt-0.5 h-5 w-5 text-green-600" />
                    <div>
                      <h5 className="font-medium">Public data (will be transferred)</h5>
                      <p className="text-muted-foreground text-sm">
                        {summary.catalogs.public} public catalogs and {summary.datasets.public} public datasets will be
                        transferred to the system.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Trash2 className="text-destructive mt-0.5 h-5 w-5" />
                    <div>
                      <h5 className="font-medium">Private data (will be deleted)</h5>
                      <p className="text-muted-foreground text-sm">
                        {summary.catalogs.private} private catalogs, {summary.datasets.private} private datasets, and{" "}
                        {summary.events.inPrivateDatasets} events will be permanently deleted.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-amber-50 p-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="text-sm">
                    <strong>{"7-day grace period: "}</strong>
                    You can cancel the deletion anytime within 7 days. After that, this action cannot be undone.
                  </p>
                </div>
              </>
            )}

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleSetStepConfirm} disabled={loading || !summary}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            {error && <div className="bg-destructive/10 text-destructive rounded-md p-4">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <div className="bg-destructive/10 rounded-md p-4">
              <p className="text-destructive text-sm">
                By clicking &quot;Delete My Account&quot;, you acknowledge that:
              </p>
              <ul className="text-destructive mt-2 list-inside list-disc text-sm">
                <li>Your private data will be permanently deleted after 7 days</li>
                <li>Public data will be transferred to the system</li>
                <li>This action cannot be undone after the grace period</li>
              </ul>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={handleSetStepSummary} disabled={loading}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleScheduleDeletion} disabled={loading || !password}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete My Account
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Your account deletion has been scheduled for{" "}
              <strong>
                {deletionScheduledAt ? new Date(deletionScheduledAt).toLocaleDateString() : "7 days from now"}
              </strong>
              .
            </p>

            <div className="bg-muted rounded-md p-4">
              <p className="text-sm">
                You can cancel this deletion anytime before the scheduled date by returning to this page. After that,
                the deletion will be permanent.
              </p>
            </div>

            <DialogFooter className="pt-4">
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
