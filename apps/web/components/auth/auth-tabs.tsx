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
import { useTranslations } from "next-intl";
import { useState } from "react";

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
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value as "signin" | "signup");
  };

  const handleSwitchToSignup = () => {
    setActiveTab("signup");
  };

  const handleSwitchToSignin = () => {
    setActiveTab("signin");
  };

  return (
    <div className={cn("w-full max-w-md", className)}>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">
            {tCommon("signIn")}
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            {tCommon("signUp")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <LoginForm onSuccess={onSuccess} />
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {t("noAccount")}{" "}
            <button type="button" className="text-primary hover:underline" onClick={handleSwitchToSignup}>
              {tCommon("signUp")}
            </button>
          </p>
        </TabsContent>

        <TabsContent value="signup">
          <RegisterForm onSuccess={onSuccess} />
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {t("hasAccount")}{" "}
            <button type="button" className="text-primary hover:underline" onClick={handleSwitchToSignin}>
              {tCommon("signIn")}
            </button>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};
