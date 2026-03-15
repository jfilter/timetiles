/**
 * Change email form component.
 *
 * Allows users to change their email address with password confirmation.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@timetiles/ui";
import { Check, Loader2, Mail } from "lucide-react";
import { useCallback, useState } from "react";

import { changeEmailRequest } from "@/lib/hooks/use-account-mutations";
import { useFormMutation } from "@/lib/hooks/use-form-mutation";

interface ChangeEmailFormProps {
  currentEmail: string;
  onSuccess?: () => void;
}

export const ChangeEmailForm = ({ currentEmail, onSuccess }: ChangeEmailFormProps) => {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const { status, error, isLoading, mutate, reset } = useFormMutation({
    mutationFn: async (input: { newEmail: string; password: string; currentEmail: string }) => {
      const emailLower = input.newEmail.trim().toLowerCase();
      if (emailLower === input.currentEmail.toLowerCase()) {
        throw new Error("New email must be different from current email");
      }

      return changeEmailRequest({ newEmail: emailLower, password: input.password });
    },
    onSuccess: () => {
      setNewEmail("");
      setPassword("");
      onSuccess?.();
    },
  });

  const handleNewEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewEmail(e.target.value);
      reset();
    },
    [reset]
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      reset();
    },
    [reset]
  );

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!newEmail || !password) return;

      mutate({ newEmail, password, currentEmail });
    },
    [newEmail, password, currentEmail, mutate]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Change Email
        </CardTitle>
        <CardDescription>Update the email address associated with your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
              <Check className="h-4 w-4" />
              Email changed. Please check your new email for a verification link.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-email">Current Email</Label>
            <Input id="current-email" type="email" value={currentEmail} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-email">New Email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={handleNewEmailChange}
              placeholder="Enter new email"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-password">Password</Label>
            <Input
              id="email-password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Confirm with your password"
              disabled={isLoading}
            />
            <p className="text-muted-foreground text-xs">Enter your password to confirm this change</p>
          </div>

          <Button type="submit" disabled={isLoading || !newEmail || !password}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Email
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
