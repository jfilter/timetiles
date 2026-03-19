/**
 * Change password form component.
 *
 * Allows users to change their password by providing current and new password.
 *
 * @module
 * @category Components
 */
"use client";

import { useMutation } from "@tanstack/react-query";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@timetiles/ui";
import { Check, Key, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { MIN_PASSWORD_LENGTH, validatePasswords } from "@/lib/constants/validation";
import { changePasswordRequest } from "@/lib/hooks/use-account-mutations";
import { useInputState } from "@/lib/hooks/use-input-state";

export const ChangePasswordForm = () => {
  const t = useTranslations("Account");
  const { status, error, isPending, mutate, reset } = useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      validatePasswords(input.newPassword, input.confirmPassword);

      return changePasswordRequest({ currentPassword: input.currentPassword, newPassword: input.newPassword });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });
  const [currentPassword, onCurrentPasswordChange, setCurrentPassword] = useInputState("", reset);
  const [newPassword, onNewPasswordChange, setNewPassword] = useInputState("", reset);
  const [confirmPassword, onConfirmPasswordChange, setConfirmPassword] = useInputState("", reset);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) return;

    mutate({ currentPassword, newPassword, confirmPassword });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t("changePassword")}
        </CardTitle>
        <CardDescription>{t("changePasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error?.message}</div>}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
              <Check className="h-4 w-4" />
              {t("passwordChangedSuccess")}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-password">{t("currentPassword")}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={onCurrentPasswordChange}
              placeholder={t("currentPasswordPlaceholder")}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={onNewPasswordChange}
              placeholder={t("newPasswordPlaceholder")}
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">{t("passwordMinLength", { length: MIN_PASSWORD_LENGTH })}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("confirmNewPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={onConfirmPasswordChange}
              placeholder={t("confirmPasswordPlaceholder")}
              disabled={isPending}
            />
          </div>

          <Button type="submit" disabled={isPending || !currentPassword || !newPassword || !confirmPassword}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
