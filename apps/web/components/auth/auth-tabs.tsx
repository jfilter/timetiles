/**
 * Auth tabs component combining login and registration forms.
 *
 * Provides a tabbed interface for switching between sign in and sign up.
 * Used in the import wizard's authentication step.
 *
 * @module
 * @category Components
 */
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useState } from "react";

import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export interface AuthTabsProps {
  /** Default tab value ("signin" or "signup") */
  defaultTab?: "signin" | "signup";
  /** Callback fired on successful authentication */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const AuthTabs = ({ defaultTab = "signin", onSuccess, className }: Readonly<AuthTabsProps>) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as "signin" | "signup");
  }, []);

  const handleSwitchToSignup = useCallback(() => {
    setActiveTab("signup");
  }, []);

  const handleSwitchToSignin = useCallback(() => {
    setActiveTab("signin");
  }, []);

  return (
    <div className={cn("w-full max-w-md", className)}>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">
            Sign In
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            Sign Up
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <LoginForm onSuccess={onSuccess} />
          <p className="text-muted-foreground mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <button type="button" className="text-primary hover:underline" onClick={handleSwitchToSignup}>
              Sign up
            </button>
          </p>
        </TabsContent>

        <TabsContent value="signup">
          <RegisterForm onSuccess={onSuccess} />
          <p className="text-muted-foreground mt-4 text-center text-sm">
            Already have an account?{" "}
            <button type="button" className="text-primary hover:underline" onClick={handleSwitchToSignin}>
              Sign in
            </button>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};
