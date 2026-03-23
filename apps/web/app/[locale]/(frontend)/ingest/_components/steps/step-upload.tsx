/**
 * Upload step for the import wizard.
 *
 * Provides drag-and-drop file upload with preview of detected sheets,
 * or URL input with authentication configuration for scheduled ingests.
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

import { usePreviewSchemaUploadMutation, usePreviewSchemaUrlMutation } from "@/lib/hooks/use-ingest-wizard-mutations";
import type { UrlAuthConfig } from "@/lib/types/ingest-wizard";
import { formatFileSize } from "@/lib/utils/format";

import { AuthConfigFields } from "../auth-config-fields";
import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardStore } from "../wizard-store";
import { JsonApiConfigPanel } from "./json-api-config-panel";

export interface StepUploadProps {
  className?: string;
}

const ACCEPTED_TYPES = [
  "text/csv",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  ".csv",
  ".json",
  ".xls",
  ".xlsx",
  ".ods",
];

type InputMode = "file" | "url";

export const StepUpload = ({ className }: Readonly<StepUploadProps>) => {
  const t = useTranslations("Ingest");
  const file = useWizardStore((s) => s.file);
  const sheets = useWizardStore((s) => s.sheets);
  const sourceUrl = useWizardStore((s) => s.sourceUrl);
  const editMode = useWizardStore((s) => s.editMode);
  const storeAuthConfig = useWizardStore((s) => s.authConfig);
  const nextStep = useWizardStore((s) => s.nextStep);
  const setFile = useWizardStore((s) => s.setFile);
  const setSourceUrl = useWizardStore((s) => s.setSourceUrl);
  const jsonApiConfig = useWizardStore((s) => s.jsonApiConfig);
  const setJsonApiConfig = useWizardStore((s) => s.setJsonApiConfig);
  const clearFile = useWizardStore((s) => s.clearFile);
  const canProceed = useWizardCanProceed();

  // Input mode - file upload or URL (edit mode always starts with URL)
  const [inputMode, setInputMode] = useState<InputMode>(sourceUrl != null || editMode ? "url" : "file");

  const uploadMutation = usePreviewSchemaUploadMutation();
  const urlMutation = usePreviewSchemaUrlMutation();

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonDetected, setJsonDetected] = useState(false);

  // URL input state — in edit mode, pre-fill from store
  const [urlInput, setUrlInput] = useState(sourceUrl ?? "");
  const [authConfig, setAuthConfig] = useState<UrlAuthConfig>(
    storeAuthConfig ?? {
      type: "none",
      apiKey: "",
      apiKeyHeader: "X-API-Key",
      bearerToken: "",
      username: "",
      password: "",
    }
  );

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
        data.previewId,
        undefined,
        data.configSuggestions
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

      const data = await urlMutation.mutateAsync({
        sourceUrl: urlInput.trim(),
        authConfig: authPayload,
        recordsPath: jsonApiConfig?.recordsPath,
      });

      setSourceUrl(urlInput.trim(), authConfig.type === "none" ? null : authConfig);

      // Detect JSON conversion and store config
      if (data.wasConverted) {
        setJsonDetected(true);
        if (!jsonApiConfig) {
          setJsonApiConfig({ wasAutoDetected: true });
        }
      } else {
        setJsonDetected(false);
      }

      setFile(
        { name: data.fileName, size: data.contentLength, mimeType: data.contentType },
        data.sheets,
        data.previewId,
        urlInput.trim(),
        data.configSuggestions
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
        <CollapsibleTrigger className="text-muted-foreground hover:text-cartographic-charcoal py-2 text-sm font-medium">
          {t("authSettings")}
          <ChevronDownIcon className="h-4 w-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-4">
            <AuthConfigFields authConfig={authConfig} onAuthConfigChange={setAuthConfig} />
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
              {sourceUrl && <p className="text-muted-foreground truncate font-mono text-xs">{sourceUrl}</p>}
              <div className="text-muted-foreground flex items-center gap-3 font-mono text-sm">
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
            className="text-muted-foreground hover:text-cartographic-charcoal shrink-0"
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
                  <span className="text-muted-foreground font-mono text-xs">
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
        <p className="text-muted-foreground mt-2">{t("uploadDescription")}</p>
      </div>

      {/* Edit mode info banner */}
      {editMode && !file && (
        <div className="bg-primary/5 border-primary/20 rounded-lg border p-4 text-sm">{t("refetchRequired")}</div>
      )}

      {/* Show preview if file is already loaded */}
      {file && (
        <>
          {renderPreview()}
          {jsonDetected && sourceUrl && (
            <JsonApiConfigPanel
              jsonApiConfig={jsonApiConfig}
              onConfigChange={setJsonApiConfig}
              onReload={handleFetchClick}
              isReloading={urlMutation.isPending}
            />
          )}
        </>
      )}

      {/* No file loaded: show input mode selector */}
      {!file && editMode && renderUrlInput()}

      {!file && !editMode && (
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
          <span className={cn("text-sm", canProceed ? "text-cartographic-forest" : "text-muted-foreground")}>
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
