/**
 * URL input form with authentication configuration for the import wizard upload step.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from "lucide-react";
import { useCallback, useState } from "react";

import type { UrlAuthConfig } from "../wizard-context";

interface UrlInputFormProps {
  initialUrl: string;
  isLoading: boolean;
  onFetch: (url: string, authConfig: UrlAuthConfig | null) => void;
}

export const UrlInputForm = ({ initialUrl, isLoading, onFetch }: Readonly<UrlInputFormProps>) => {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [showAuthConfig, setShowAuthConfig] = useState(false);
  const [authConfig, setAuthConfig] = useState<UrlAuthConfig>({
    type: "none",
    apiKey: "",
    apiKeyHeader: "X-API-Key",
    bearerToken: "",
    username: "",
    password: "",
  });

  const handleFetchClick = useCallback(() => {
    onFetch(urlInput.trim(), authConfig.type !== "none" ? authConfig : null);
  }, [urlInput, authConfig, onFetch]);

  const handleUrlInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
  }, []);

  const toggleAuthConfig = useCallback(() => {
    setShowAuthConfig((prev) => !prev);
  }, []);

  const handleAuthTypeChange = useCallback((value: string) => {
    setAuthConfig((prev) => ({ ...prev, type: value as UrlAuthConfig["type"] }));
  }, []);

  const handleFieldChange = useCallback((field: keyof UrlAuthConfig) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setAuthConfig((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }, []);

  const renderAuthFields = () => {
    switch (authConfig.type) {
      case "api-key":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Your API key"
                value={authConfig.apiKey ?? ""}
                onChange={handleFieldChange("apiKey")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-header">Header Name</Label>
              <Input
                id="api-key-header"
                placeholder="X-API-Key"
                value={authConfig.apiKeyHeader ?? "X-API-Key"}
                onChange={handleFieldChange("apiKeyHeader")}
              />
            </div>
          </div>
        );
      case "bearer":
        return (
          <div className="space-y-2">
            <Label htmlFor="bearer-token">Bearer Token</Label>
            <Input
              id="bearer-token"
              type="password"
              placeholder="Your bearer token"
              value={authConfig.bearerToken ?? ""}
              onChange={handleFieldChange("bearerToken")}
            />
          </div>
        );
      case "basic":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Username"
                value={authConfig.username ?? ""}
                onChange={handleFieldChange("username")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={authConfig.password ?? ""}
                onChange={handleFieldChange("password")}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor="source-url">Data URL</Label>
        <div className="flex gap-2">
          <Input
            id="source-url"
            type="url"
            placeholder="https://example.com/data.csv"
            value={urlInput}
            onChange={handleUrlInputChange}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="button" onClick={handleFetchClick} disabled={isLoading || !urlInput.trim()}>
            {isLoading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Enter a URL that returns CSV, Excel, or ODS data. You can set up automatic scheduled imports after review.
        </p>
      </div>

      {/* Auth Configuration Toggle */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleAuthConfig}
        className="text-muted-foreground hover:text-foreground gap-1"
      >
        {showAuthConfig ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        Authentication settings
      </Button>

      {/* Auth Configuration Form */}
      {showAuthConfig && (
        <Card className="p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-type">Authentication Type</Label>
              <Select value={authConfig.type} onValueChange={handleAuthTypeChange}>
                <SelectTrigger id="auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No authentication</SelectItem>
                  <SelectItem value="api-key">API Key</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth (username/password)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderAuthFields()}
          </div>
        </Card>
      )}
    </div>
  );
};
