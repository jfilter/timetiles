/**
 * Client component for account settings.
 *
 * Handles profile display, password/email changes, and account deletion workflow.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui";
import { AlertTriangle } from "lucide-react";
import { useCallback, useState } from "react";

import type { User } from "@/payload-types";

import { ChangeEmailForm } from "./change-email-form";
import { ChangePasswordForm } from "./change-password-form";
import { DataExportCard } from "./data-export-card";
import { DeleteAccountModal } from "./delete-account-modal";
import { PendingDeletionBanner } from "./pending-deletion-banner";

interface AccountSettingsClientProps {
  user: User;
}

export const AccountSettingsClient = ({ user }: AccountSettingsClientProps) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const handleDeletionScheduled = useCallback((deletionScheduledAt: string) => {
    setCurrentUser((prev) => ({
      ...prev,
      deletionStatus: "pending_deletion" as const,
      deletionScheduledAt,
    }));
    setShowDeleteModal(false);
  }, []);

  const handleDeletionCancelled = useCallback(() => {
    setCurrentUser((prev) => ({
      ...prev,
      deletionStatus: "active" as const,
      deletionScheduledAt: null,
      deletionRequestedAt: null,
    }));
  }, []);

  const handleEmailChanged = useCallback((newEmail: string) => {
    setCurrentUser((prev) => ({
      ...prev,
      email: newEmail,
    }));
  }, []);

  const handleOpenDeleteModal = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleModalOpenChange = useCallback((open: boolean) => {
    setShowDeleteModal(open);
  }, []);

  return (
    <div className="space-y-6">
      {/* Pending Deletion Banner */}
      {currentUser.deletionStatus === "pending_deletion" && currentUser.deletionScheduledAt && (
        <PendingDeletionBanner
          deletionScheduledAt={currentUser.deletionScheduledAt}
          onCancelled={handleDeletionCancelled}
        />
      )}

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-muted-foreground text-sm font-medium">Email</label>
            <p className="text-sm">{currentUser.email}</p>
          </div>
          {(currentUser.firstName ?? currentUser.lastName) && (
            <div>
              <label className="text-muted-foreground text-sm font-medium">Name</label>
              <p className="text-sm">{[currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ")}</p>
            </div>
          )}
          <div>
            <label className="text-muted-foreground text-sm font-medium">Role</label>
            <p className="text-sm capitalize">{currentUser.role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Change Email */}
      <ChangeEmailForm currentEmail={currentUser.email} onEmailChanged={handleEmailChanged} />

      {/* Change Password */}
      <ChangePasswordForm />

      <hr className="border-border" />

      {/* Data Export */}
      <DataExportCard />

      <hr className="border-border" />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions that affect your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-destructive/10 border-destructive/30 mb-4 rounded-md border p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <h4 className="text-destructive font-medium">Delete Account</h4>
                <p className="text-muted-foreground mt-1 text-sm">
                  Once you delete your account, public data will be transferred to the system, and private data will be
                  permanently deleted. This action cannot be undone after the grace period.
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={handleOpenDeleteModal}
            disabled={currentUser.deletionStatus === "pending_deletion"}
          >
            {currentUser.deletionStatus === "pending_deletion" ? "Deletion Scheduled" : "Delete Account"}
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        open={showDeleteModal}
        onOpenChange={handleModalOpenChange}
        onDeletionScheduled={handleDeletionScheduled}
      />
    </div>
  );
};
