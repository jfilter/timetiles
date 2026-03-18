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
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
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
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
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
          <CardTitle>{t("profileInfo")}</CardTitle>
          <CardDescription>{t("profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-muted-foreground text-sm font-medium">{tCommon("email")}</span>
            <p className="text-sm">{user.email}</p>
          </div>
          {(user.firstName ?? user.lastName) && (
            <div>
              <span className="text-muted-foreground text-sm font-medium">{tCommon("name")}</span>
              <p className="text-sm">{[user.firstName, user.lastName].filter(Boolean).join(" ")}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground text-sm font-medium">{tCommon("role")}</span>
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
            {t("dangerZone")}
          </CardTitle>
          <CardDescription>{t("dangerZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-destructive/10 border-destructive/30 mb-4 rounded-md border p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <h4 className="text-destructive font-medium">{t("deleteAccount")}</h4>
                <p className="text-muted-foreground mt-1 text-sm">{t("deleteAccountDescription")}</p>
              </div>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={handleOpenDeleteModal}
            disabled={user.deletionStatus === "pending_deletion"}
          >
            {user.deletionStatus === "pending_deletion" ? t("deletionScheduled") : t("deleteAccount")}
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
