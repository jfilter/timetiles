/**
 * Authentication step for the import wizard.
 *
 * Displays login/register forms for unauthenticated users.
 * Shows verification reminder for unverified users.
 * Auto-advances when authenticated and verified.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { CheckCircle2Icon, Loader2Icon, MailIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuthTabs } from "@/components/auth";

import { useWizard } from "../wizard-context";

export interface StepAuthProps {
  className?: string;
}

export const StepAuth = ({ className }: Readonly<StepAuthProps>) => {
  const { state, nextStep, setAuth } = useWizard();
  const { isAuthenticated, isEmailVerified } = state;
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check auth status on mount via API (workaround for SSR auth issues)
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch("/api/users/me", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            const verified = data.user._verified === true;
            setAuth(true, verified, data.user.id);
          }
        }
      } catch {
        // Not authenticated - keep current state
      } finally {
        setIsCheckingAuth(false);
      }
    };

    // Only check if we think we're not authenticated
    if (!isAuthenticated) {
      void checkAuthStatus();
    } else {
      setIsCheckingAuth(false);
    }
  }, [isAuthenticated, setAuth]);

  // Auto-advance when authenticated and verified
  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated && isEmailVerified) {
      nextStep();
    }
  }, [isCheckingAuth, isAuthenticated, isEmailVerified, nextStep]);

  // Handle successful auth - instead of page reload, check auth status
  const handleAuthSuccess = useCallback(() => {
    // Check auth status via API after successful login
    void (async () => {
      try {
        const response = await fetch("/api/users/me", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            const verified = data.user._verified === true;
            setAuth(true, verified, data.user.id);
          }
        }
      } catch {
        // Fallback to page reload
        window.location.reload();
      }
    })();
  }, [setAuth]);

  // Handle switching to different account
  const handleSwitchAccount = useCallback(() => {
    setAuth(false, false, null);
  }, [setAuth]);

  // Show loading while checking auth status
  if (isCheckingAuth) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <div className="text-center">
          <Loader2Icon className="text-primary mx-auto mb-4 h-12 w-12 animate-spin" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Authenticated but not verified
  if (isAuthenticated && !isEmailVerified) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="bg-warning/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <MailIcon className="text-warning h-8 w-8" />
            </div>
            <CardTitle>Verify Your Email</CardTitle>
            <CardDescription>Please check your inbox and click the verification link to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-center text-sm">
              Haven&apos;t received the email? Check your spam folder or request a new verification link.
            </p>
            <div className="flex justify-center">
              <button type="button" className="text-primary text-sm hover:underline" onClick={handleSwitchAccount}>
                Sign in with a different account
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated and verified (brief display before auto-advance)
  if (isAuthenticated && isEmailVerified) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <div className="text-center">
          <CheckCircle2Icon className="text-primary mx-auto mb-4 h-16 w-16" />
          <h2 className="text-xl font-semibold">You&apos;re signed in</h2>
          <p className="text-muted-foreground mt-2">Continuing to upload...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login/register
  return (
    <div className={cn("flex flex-col items-center justify-center py-8", className)}>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold">Sign in to continue</h2>
        <p className="text-muted-foreground mt-2">Create an account or sign in to import your data.</p>
      </div>

      <AuthTabs onSuccess={handleAuthSuccess} />
    </div>
  );
};
