/**
 * Change password form component.
 *
 * Allows users to change their password by providing current and new password.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@timetiles/ui";
import { Check, Key, Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { MIN_PASSWORD_LENGTH, validatePasswords } from "@/lib/constants/validation";
import { changePasswordRequest } from "@/lib/hooks/use-account-mutations";

export const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const fieldHandler = (setter: Dispatch<SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    reset();
  };

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
          Change Password
        </CardTitle>
        <CardDescription>Update your password to keep your account secure</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error?.message}</div>}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
              <Check className="h-4 w-4" />
              Password changed successfully
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={fieldHandler(setCurrentPassword)}
              placeholder="Enter current password"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={fieldHandler(setNewPassword)}
              placeholder="Enter new password"
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">Must be at least {MIN_PASSWORD_LENGTH} characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={fieldHandler(setConfirmPassword)}
              placeholder="Confirm new password"
              disabled={isPending}
            />
          </div>

          <Button type="submit" disabled={isPending || !currentPassword || !newPassword || !confirmPassword}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
