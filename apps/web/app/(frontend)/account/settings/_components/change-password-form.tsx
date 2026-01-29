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
import { useCallback, useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

export const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCurrentPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPassword(e.target.value);
    setError(null);
    setSuccess(false);
  }, []);

  const handleNewPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value);
    setError(null);
    setSuccess(false);
  }, []);

  const handleConfirmPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setError(null);
    setSuccess(false);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("All fields are required");
        return;
      }

      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("New passwords do not match");
        return;
      }

      setLoading(true);
      setError(null);

      void (async () => {
        try {
          const response = await fetch("/api/account/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ currentPassword, newPassword }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "Failed to change password");
          }

          setSuccess(true);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to change password");
        } finally {
          setLoading(false);
        }
      })();
    },
    [currentPassword, newPassword, confirmPassword]
  );

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
          {error && <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>}

          {success && (
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
              onChange={handleCurrentPasswordChange}
              placeholder="Enter current password"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              placeholder="Enter new password"
              disabled={loading}
            />
            <p className="text-muted-foreground text-xs">Must be at least {MIN_PASSWORD_LENGTH} characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              placeholder="Confirm new password"
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading || !currentPassword || !newPassword || !confirmPassword}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
