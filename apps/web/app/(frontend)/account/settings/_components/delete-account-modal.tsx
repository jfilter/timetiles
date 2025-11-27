/**
 * Delete account modal component.
 *
 * Multi-step modal for account deletion with data summary and confirmation.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@timetiles/ui";
import { AlertTriangle, Check, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface DeletionSummary {
  catalogs: { public: number; private: number };
  datasets: { public: number; private: number };
  events: { inPublicDatasets: number; inPrivateDatasets: number };
  scheduledImports: number;
  importFiles: number;
  media: number;
}

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeletionScheduled: (deletionScheduledAt: string) => void;
}

type Step = "summary" | "confirm" | "success";

export const DeleteAccountModal = ({ open, onOpenChange, onDeletionScheduled }: DeleteAccountModalProps) => {
  const [step, setStep] = useState<Step>("summary");
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/account/deletion-summary", {
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to fetch summary");
      }

      const data = await response.json();

      if (!data.canDelete) {
        setError(data.reason ?? "Cannot delete account");
        return;
      }

      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch deletion summary when modal opens
  useEffect(() => {
    if (open && step === "summary") {
      void fetchSummary();
    }
  }, [open, step, fetchSummary]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("summary");
      setSummary(null);
      setError(null);
      setPassword("");
      setDeletionScheduledAt(null);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (step === "success" && deletionScheduledAt) {
      onDeletionScheduled(deletionScheduledAt);
    }
    onOpenChange(false);
  }, [step, deletionScheduledAt, onDeletionScheduled, onOpenChange]);

  const handleBackdropClick = useCallback(() => {
    handleClose();
  }, [handleClose]);

  const handleSetStepConfirm = useCallback(() => {
    setStep("confirm");
  }, []);

  const handleSetStepSummary = useCallback(() => {
    setStep("summary");
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleScheduleDeletion = useCallback(() => {
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to schedule deletion");
        }

        setDeletionScheduledAt(data.deletionScheduledAt);
        setStep("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to schedule deletion");
      } finally {
        setLoading(false);
      }
    })();
  }, [password]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={handleBackdropClick} />

      {/* Modal */}
      <Card className="relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
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
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          {step === "summary" && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">Review what will happen to your data before proceeding.</p>

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
                        Catalogs: {summary.catalogs.public + summary.catalogs.private} ({summary.catalogs.public}{" "}
                        public, {summary.catalogs.private} private)
                      </p>
                      <p>
                        Datasets: {summary.datasets.public + summary.datasets.private} ({summary.datasets.public}{" "}
                        public, {summary.datasets.private} private)
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
                          {summary.catalogs.public} public catalogs and {summary.datasets.public} public datasets will
                          be transferred to the system.
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
                      <strong>7-day grace period:</strong> You can cancel the deletion anytime within 7 days. After
                      that, this action cannot be undone.
                    </p>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleSetStepConfirm} disabled={loading || !summary}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">Enter your password to schedule account deletion.</p>

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

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleSetStepSummary} disabled={loading}>
                  Back
                </Button>
                <Button variant="destructive" onClick={handleScheduleDeletion} disabled={loading || !password}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete My Account
                </Button>
              </div>
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

              <div className="flex justify-end pt-4">
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
