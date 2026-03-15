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
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeletionScheduled = () => {
    setShowDeleteModal(false);
    router.refresh();
  };

  const handleEmailChanged = () => {
    router.refresh();
  };

  const handleOpenDeleteModal = () => {
    setShowDeleteModal(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setShowDeleteModal(open);
  };

  return (
    <div className="space-y-6">
      {/* Pending Deletion Banner */}
      {user.deletionStatus === "pending_deletion" && user.deletionScheduledAt && (
        <PendingDeletionBanner deletionScheduledAt={user.deletionScheduledAt} />
      )}

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-muted-foreground text-sm font-medium">Email</span>
            <p className="text-sm">{user.email}</p>
          </div>
          {(user.firstName ?? user.lastName) && (
            <div>
              <span className="text-muted-foreground text-sm font-medium">Name</span>
              <p className="text-sm">{[user.firstName, user.lastName].filter(Boolean).join(" ")}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground text-sm font-medium">Role</span>
            <p className="text-sm capitalize">{user.role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Change Email */}
      <ChangeEmailForm currentEmail={user.email} onSuccess={handleEmailChanged} />

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
            disabled={user.deletionStatus === "pending_deletion"}
          >
            {user.deletionStatus === "pending_deletion" ? "Deletion Scheduled" : "Delete Account"}
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
