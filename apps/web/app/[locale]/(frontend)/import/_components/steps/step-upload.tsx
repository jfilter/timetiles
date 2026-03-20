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

import {
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowRight,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileSpreadsheetIcon,
  GlobeIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { usePreviewSchemaUploadMutation, usePreviewSchemaUrlMutation } from "@/lib/hooks/use-import-wizard-mutations";
import type { UrlAuthConfig } from "@/lib/types/import-wizard";
import { formatFileSize } from "@/lib/utils/format";

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
  const t = useTranslations("Import");
  const { state, nextStep, canProceed, setFile, setSourceUrl, clearFile } = useWizard();
  const { file, sheets, sourceUrl } = state;

  // Input mode - file upload or URL
  const [inputMode, setInputMode] = useState<InputMode>(sourceUrl ? "url" : "file");

  const uploadMutation = usePreviewSchemaUploadMutation();
  const urlMutation = usePreviewSchemaUrlMutation();

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL input state
  const [urlInput, setUrlInput] = useState(sourceUrl ?? "");
  const [authConfig, setAuthConfig] = useState<UrlAuthConfig>({
    type: "none",
    apiKey: "",
    apiKeyHeader: "X-API-Key",
    bearerToken: "",
    username: "",
    password: "",
  });

  // Auth config handlers
  const handleAuthTypeChange = (value: string) => {
    setAuthConfig((prev) => ({ ...prev, type: value as UrlAuthConfig["type"] }));
  };

  const handleAuthField = (field: keyof UrlAuthConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthConfig((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
  };

  const handleInputModeChange = (value: string) => {
    setInputMode(value as InputMode);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      void processFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      void processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile: File) => {
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const data = await uploadMutation.mutateAsync(formData);

      setFile(
        { name: selectedFile.name, size: selectedFile.size, mimeType: selectedFile.type },
        data.sheets,
        data.previewId
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToProcessFile"));
    }
  };

  const processUrl = async () => {
    if (!urlInput.trim()) {
      setError(t("pleaseEnterUrl"));
      return;
    }

    setError(null);

    try {
      const authPayload = authConfig.type === "none" ? undefined : authConfig;

      const data = await urlMutation.mutateAsync({ sourceUrl: urlInput.trim(), authConfig: authPayload });

      setSourceUrl(urlInput.trim(), authConfig.type === "none" ? null : authConfig);

      setFile(
        { name: data.fileName, size: data.contentLength, mimeType: data.contentType },
        data.sheets,
        data.previewId,
        urlInput.trim()
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToFetchUrl"));
    }
  };

  const handleRemoveFile = () => {
    clearFile();
    setError(null);
    setUrlInput("");
  };

  // Render the file upload area
  const renderFileUpload = () => (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-12 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        uploadMutation.isPending && "pointer-events-none opacity-50"
      )}
      role="presentation"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploadMutation.isPending ? (
        <div className="flex flex-col items-center">
          <Loader2Icon className="text-primary h-12 w-12 animate-spin" />
          <p className="text-muted-foreground mt-4">{t("processingFile")}</p>
        </div>
      ) : (
        <>
          <UploadIcon className="text-muted-foreground mx-auto h-12 w-12" />
          <p className="mt-4 text-lg font-medium">{t("dragAndDrop")}</p>
          <p className="text-muted-foreground mt-2">{t("or")}</p>
          <label className="mt-4 inline-block cursor-pointer" aria-label={t("browseFiles")}>
            <input type="file" accept={ACCEPTED_TYPES.join(",")} onChange={handleFileSelect} className="sr-only" />
            <Button type="button" variant="outline" asChild>
              <span>{t("browseFiles")}</span>
            </Button>
          </label>
          <p className="text-muted-foreground mt-4 text-sm">{t("supportedFormats")}</p>
        </>
      )}
    </div>
  );

  // Handler for fetch button
  const handleFetchClick = () => {
    void processUrl();
  };

  // Render auth fields based on type
  const renderAuthFields = () => {
    switch (authConfig.type) {
      case "api-key":
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="api-key">{t("apiKey")}</Label>
              <Input
                id="api-key"
                type="password"
                placeholder={t("apiKeyPlaceholder")}
                value={authConfig.apiKey ?? ""}
                onChange={handleAuthField("apiKey")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-header">{t("headerName")}</Label>
              <Input
                id="api-key-header"
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
            <Label htmlFor="bearer-token">{t("bearerToken")}</Label>
            <Input
              id="bearer-token"
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
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                placeholder={t("username")}
                value={authConfig.username ?? ""}
                onChange={handleAuthField("username")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("passwordLabel")}</Label>
              <Input
                id="password"
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

  // Render the URL input form
  const renderUrlInput = () => (
    <div className="space-y-4">
      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor="source-url">{t("dataUrl")}</Label>
        <div className="flex gap-2">
          <Input
            id="source-url"
            type="url"
            placeholder="https://example.com/data.csv"
            value={urlInput}
            onChange={handleUrlInputChange}
            disabled={urlMutation.isPending}
            className="flex-1"
          />
          <Button type="button" onClick={handleFetchClick} disabled={urlMutation.isPending || !urlInput.trim()}>
            {urlMutation.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : t("fetch")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t("dataUrlDescription")}</p>
      </div>

      {/* Auth Configuration */}
      <Collapsible>
        <CollapsibleTrigger className="text-cartographic-navy/70 hover:text-cartographic-charcoal py-2 text-sm font-medium">
          {t("authSettings")}
          <ChevronDownIcon className="h-4 w-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-type">{t("authType")}</Label>
                <Select value={authConfig.type} onValueChange={handleAuthTypeChange}>
                  <SelectTrigger id="auth-type">
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
              {renderAuthFields()}
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
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
            {sourceUrl ? t("urlDataReady") : t("fileReady")}
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
                  <span>{t("rowCount", { count: sheets[0]?.rowCount.toLocaleString() ?? "0" })}</span>
                ) : (
                  <span>{t("sheetCount", { count: sheets.length })}</span>
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
            aria-label={t("removeFile")}
            className="text-cartographic-navy/50 hover:text-cartographic-charcoal shrink-0"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Multi-sheet details */}
        {sheets.length > 1 && (
          <div className="border-cartographic-navy/10 mt-4 border-t pt-4">
            <p className="text-cartographic-charcoal mb-2 text-sm font-medium">{t("sheets")}</p>
            <ul className="space-y-1">
              {sheets.map((sheet) => (
                <li
                  key={sheet.index}
                  className="bg-cartographic-cream/50 flex items-center justify-between rounded-sm px-3 py-2"
                >
                  <span className="text-cartographic-charcoal text-sm">{sheet.name}</span>
                  <span className="text-cartographic-navy/70 font-mono text-xs">
                    {t("rowCount", { count: sheet.rowCount.toLocaleString() })}
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
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("uploadTitle")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("uploadDescription")}</p>
      </div>

      {/* Show preview if file is already loaded */}
      {file ? (
        renderPreview()
      ) : (
        <Tabs value={inputMode} onValueChange={handleInputModeChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" className="gap-2">
              <UploadIcon className="h-4 w-4" />
              {t("fileUpload")}
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2">
              <GlobeIcon className="h-4 w-4" />
              {t("fromUrl")}
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

      {/* Sticky continue footer */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm", canProceed ? "text-cartographic-forest" : "text-cartographic-navy/50")}>
            {canProceed ? t("fileReadyToContinue") : t("uploadFileToStart")}
          </span>
          <Button size="lg" onClick={nextStep} disabled={!canProceed} className="gap-2">
            {t("continue")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
