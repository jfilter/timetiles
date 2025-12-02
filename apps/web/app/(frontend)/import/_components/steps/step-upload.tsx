/**
 * Upload step for the import wizard.
 *
 * Provides drag-and-drop file upload with preview of detected sheets,
 * or URL input with authentication configuration for scheduled imports.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileSpreadsheetIcon,
  GlobeIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { UrlAuthConfig } from "../wizard-context";
import { useWizard } from "../wizard-context";

export interface StepUploadProps {
  className?: string;
}

const ACCEPTED_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  ".csv",
  ".xls",
  ".xlsx",
  ".ods",
];

type InputMode = "file" | "url";

export const StepUpload = ({ className }: Readonly<StepUploadProps>) => {
  const { state, setFile, setSourceUrl, clearFile, nextStep, setNavigationConfig } = useWizard();
  const { file, sheets, sourceUrl } = state;

  // Configure navigation for this step
  useEffect(() => {
    setNavigationConfig({
      onNext: () => nextStep(),
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig, nextStep]);

  // Input mode - file upload or URL
  const [inputMode, setInputMode] = useState<InputMode>(sourceUrl ? "url" : "file");

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL input state
  const [urlInput, setUrlInput] = useState(sourceUrl ?? "");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [showAuthConfig, setShowAuthConfig] = useState(false);
  const [authConfig, setAuthConfig] = useState<UrlAuthConfig>({
    type: "none",
    apiKey: "",
    apiKeyHeader: "X-API-Key",
    bearerToken: "",
    username: "",
    password: "",
  });

  // Auth config handlers
  const handleAuthTypeChange = useCallback((value: string) => {
    setAuthConfig((prev) => ({ ...prev, type: value as UrlAuthConfig["type"] }));
  }, []);

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, apiKey: e.target.value }));
  }, []);

  const handleApiKeyHeaderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, apiKeyHeader: e.target.value }));
  }, []);

  const handleBearerTokenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, bearerToken: e.target.value }));
  }, []);

  const handleUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, username: e.target.value }));
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, password: e.target.value }));
  }, []);

  const handleUrlInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
  }, []);

  const toggleAuthConfig = useCallback(() => {
    setShowAuthConfig((prev) => !prev);
  }, []);

  const handleInputModeChange = useCallback((value: string) => {
    setInputMode(value as InputMode);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      void processFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      void processFile(selectedFile);
    }
  }, []);

  const processFile = async (selectedFile: File) => {
    setIsUploading(true);
    setError(null);

    try {
      // Create form data for preview API
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/wizard/preview-schema", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process file");
      }

      const data = await response.json();

      setFile(
        {
          name: selectedFile.name,
          size: selectedFile.size,
          mimeType: selectedFile.type,
        },
        data.sheets,
        data.previewId
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setIsUploading(false);
    }
  };

  // Process URL to fetch and preview schema
  const processUrl = async () => {
    if (!urlInput.trim()) {
      setError("Please enter a URL");
      return;
    }

    setIsLoadingUrl(true);
    setError(null);

    try {
      // Build auth config payload - only include fields relevant to auth type
      const authPayload = authConfig.type === "none" ? undefined : authConfig;

      const response = await fetch("/api/wizard/preview-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: urlInput.trim(),
          authConfig: authPayload,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch URL");
      }

      const data = await response.json();

      // Store the source URL and auth config in wizard state
      setSourceUrl(urlInput.trim(), authConfig.type !== "none" ? authConfig : null);

      // Set file info from URL response
      setFile(
        {
          name: data.fileName || new URL(urlInput).pathname.split("/").pop() || "url-import",
          size: data.contentLength || 0,
          mimeType: data.contentType || "application/octet-stream",
        },
        data.sheets,
        data.previewId,
        urlInput.trim()
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleRemoveFile = useCallback(() => {
    clearFile();
    setError(null);
    setUrlInput("");
  }, [clearFile]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Render the file upload area
  const renderFileUpload = () => (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-12 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        isUploading && "pointer-events-none opacity-50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="flex flex-col items-center">
          <Loader2Icon className="text-primary h-12 w-12 animate-spin" />
          <p className="text-muted-foreground mt-4">Processing file...</p>
        </div>
      ) : (
        <>
          <UploadIcon className="text-muted-foreground mx-auto h-12 w-12" />
          <p className="mt-4 text-lg font-medium">Drag and drop your file here</p>
          <p className="text-muted-foreground mt-2">or</p>
          <label className="mt-4 inline-block cursor-pointer">
            <input type="file" accept={ACCEPTED_TYPES.join(",")} onChange={handleFileSelect} className="sr-only" />
            <Button type="button" variant="outline" asChild>
              <span>Browse files</span>
            </Button>
          </label>
          <p className="text-muted-foreground mt-4 text-sm">Supported formats: CSV, XLS, XLSX, ODS</p>
        </>
      )}
    </div>
  );

  // Handler for fetch button
  const handleFetchClick = useCallback(() => {
    void processUrl();
  }, []);

  // Render auth fields based on type
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
                onChange={handleApiKeyChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-header">Header Name</Label>
              <Input
                id="api-key-header"
                placeholder="X-API-Key"
                value={authConfig.apiKeyHeader ?? "X-API-Key"}
                onChange={handleApiKeyHeaderChange}
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
              onChange={handleBearerTokenChange}
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
                onChange={handleUsernameChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={authConfig.password ?? ""}
                onChange={handlePasswordChange}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Render the URL input form
  const renderUrlInput = () => (
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
            disabled={isLoadingUrl}
            className="flex-1"
          />
          <Button type="button" onClick={handleFetchClick} disabled={isLoadingUrl || !urlInput.trim()}>
            {isLoadingUrl ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Enter a URL that returns CSV, Excel, or ODS data. You can set up automatic scheduled imports after review.
        </p>
      </div>

      {/* Auth Configuration Toggle */}
      <button
        type="button"
        onClick={toggleAuthConfig}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        {showAuthConfig ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        Authentication settings
      </button>

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

  // Render the file/data preview card
  const renderPreview = () => (
    <Card className="overflow-hidden">
      {/* Success header bar */}
      <div className="bg-cartographic-forest/10 border-cartographic-forest/20 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="text-cartographic-forest h-4 w-4" />
          <span className="text-cartographic-forest text-sm font-medium">
            {sourceUrl ? "URL data ready for import" : "File ready for import"}
          </span>
        </div>
      </div>

      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* File info */}
          <div className="flex items-start gap-4">
            <div className="bg-cartographic-cream border-cartographic-navy/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border">
              {sourceUrl ? (
                <GlobeIcon className="text-cartographic-navy h-6 w-6" />
              ) : (
                <FileSpreadsheetIcon className="text-cartographic-navy h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-medium">{file!.name}</h3>
              {sourceUrl && <p className="text-cartographic-navy/50 truncate font-mono text-xs">{sourceUrl}</p>}
              <div className="text-cartographic-navy/70 flex items-center gap-3 font-mono text-sm">
                {file!.size > 0 && (
                  <>
                    <span>{formatFileSize(file!.size)}</span>
                    <span className="text-cartographic-navy/30">·</span>
                  </>
                )}
                {sheets.length === 1 ? (
                  <span>{sheets[0]?.rowCount.toLocaleString()} rows</span>
                ) : (
                  <span>{sheets.length} sheets</span>
                )}
              </div>
            </div>
          </div>

          {/* Remove button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemoveFile}
            aria-label="Remove file"
            className="text-cartographic-navy/50 hover:text-cartographic-charcoal shrink-0"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Multi-sheet details */}
        {sheets.length > 1 && (
          <div className="border-cartographic-navy/10 mt-4 border-t pt-4">
            <p className="text-cartographic-charcoal mb-2 text-sm font-medium">Sheets</p>
            <ul className="space-y-1">
              {sheets.map((sheet) => (
                <li
                  key={sheet.index}
                  className="bg-cartographic-cream/50 flex items-center justify-between rounded-sm px-3 py-2"
                >
                  <span className="text-cartographic-charcoal text-sm">{sheet.name}</span>
                  <span className="text-cartographic-navy/70 font-mono text-xs">
                    {sheet.rowCount.toLocaleString()} rows
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Upload your data</h2>
        <p className="text-cartographic-navy/70 mt-2">
          Upload a file or fetch data from a URL containing your event data.
        </p>
      </div>

      {/* Show preview if file is already loaded */}
      {file ? (
        renderPreview()
      ) : (
        <Tabs value={inputMode} onValueChange={handleInputModeChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" className="gap-2">
              <UploadIcon className="h-4 w-4" />
              File Upload
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2">
              <GlobeIcon className="h-4 w-4" />
              From URL
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-4">
            {renderFileUpload()}
          </TabsContent>
          <TabsContent value="url" className="mt-4">
            {renderUrlInput()}
          </TabsContent>
        </Tabs>
      )}

      {/* Error message */}
      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}
    </div>
  );
};
