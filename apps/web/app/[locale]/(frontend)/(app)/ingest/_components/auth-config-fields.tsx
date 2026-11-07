/**
 * Shared auth configuration fields for URL-based imports.
 *
 * Renders auth type selector and corresponding credential inputs.
 * Used in both the Upload step (inside a collapsible) and the
 * Schedule step (compact inline form).
 *
 * @module
 * @category Components
 */
"use client";

import { Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useCallback, useId } from "react";

import type { UrlAuthConfig } from "@/lib/ingest/types/wizard";

export interface AuthConfigFieldsProps {
  authConfig: UrlAuthConfig;
  onAuthConfigChange: (config: UrlAuthConfig) => void;
  /** Compact mode for Schedule step -- tighter spacing, no card wrapper */
  compact?: boolean;
}

export const AuthConfigFields = ({ authConfig, onAuthConfigChange, compact }: Readonly<AuthConfigFieldsProps>) => {
  const t = useTranslations("Ingest");
  const instanceId = useId();

  const handleAuthTypeChange = useCallback(
    (value: string) => {
      onAuthConfigChange({ ...authConfig, type: value as UrlAuthConfig["type"] });
    },
    [authConfig, onAuthConfigChange]
  );

  const handleAuthField = useCallback(
    (field: keyof UrlAuthConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onAuthConfigChange({ ...authConfig, [field]: e.target.value });
    },
    [authConfig, onAuthConfigChange]
  );

  const renderFields = () => {
    switch (authConfig.type) {
      case "api-key":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${instanceId}-api-key`}>{t("apiKey")}</Label>
              <Input
                id={`${instanceId}-api-key`}
                type="password"
                placeholder={t("apiKeyPlaceholder")}
                value={authConfig.apiKey ?? ""}
                onChange={handleAuthField("apiKey")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${instanceId}-api-key-header`}>{t("headerName")}</Label>
              <Input
                id={`${instanceId}-api-key-header`}
                placeholder="X-API-Key"
                value={authConfig.apiKeyHeader ?? "X-API-Key"}
                onChange={handleAuthField("apiKeyHeader")}
              />
            </div>
          </div>
        );
      case "bearer":
        return (
          <div className="space-y-2">
            <Label htmlFor={`${instanceId}-bearer-token`}>{t("bearerToken")}</Label>
            <Input
              id={`${instanceId}-bearer-token`}
              type="password"
              placeholder={t("bearerTokenPlaceholder")}
              value={authConfig.bearerToken ?? ""}
              onChange={handleAuthField("bearerToken")}
            />
          </div>
        );
      case "basic":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${instanceId}-username`}>{t("username")}</Label>
              <Input
                id={`${instanceId}-username`}
                placeholder={t("username")}
                value={authConfig.username ?? ""}
                onChange={handleAuthField("username")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${instanceId}-password`}>{t("passwordLabel")}</Label>
              <Input
                id={`${instanceId}-password`}
                type="password"
                placeholder={t("passwordLabel")}
                value={authConfig.password ?? ""}
                onChange={handleAuthField("password")}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className="space-y-2">
        <Label htmlFor={`${instanceId}-auth-type`}>{t("authType")}</Label>
        <Select value={authConfig.type} onValueChange={handleAuthTypeChange}>
          <SelectTrigger id={`${instanceId}-auth-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("authNone")}</SelectItem>
            <SelectItem value="api-key">{t("apiKey")}</SelectItem>
            <SelectItem value="bearer">{t("bearerToken")}</SelectItem>
            <SelectItem value="basic">{t("authBasic")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {renderFields()}
    </div>
  );
};
