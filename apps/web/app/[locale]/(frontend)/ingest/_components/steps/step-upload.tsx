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

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowRight, GlobeIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReducer } from "react";

import { usePreviewSchemaUploadMutation, usePreviewSchemaUrlMutation } from "@/lib/hooks/use-ingest-wizard-mutations";
import type { UrlAuthConfig } from "@/lib/ingest/types/wizard";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardUploadStepState } from "../wizard-store";
import { JsonApiConfigPanel } from "./json-api-config-panel";
import { FileDropZone, UploadPreviewCard, UrlInputForm } from "./upload-sections";

export interface StepUploadProps {
  className?: string;
}

type InputMode = "file" | "url";

const DEFAULT_AUTH_CONFIG: UrlAuthConfig = {
  type: "none",
  apiKey: "",
  apiKeyHeader: "X-API-Key",
  bearerToken: "",
  username: "",
  password: "",
};

interface UploadState {
  inputMode: InputMode;
  error: string | null;
  jsonDetected: boolean;
  urlInput: string;
  authConfig: UrlAuthConfig;
}

type UploadAction =
  | { type: "SET_MODE"; mode: InputMode }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_URL"; url: string }
  | { type: "SET_AUTH"; config: UrlAuthConfig }
  | { type: "SET_JSON_DETECTED"; detected: boolean }
  | { type: "RESET_URL_STATE" };

const uploadReducer = (state: UploadState, action: UploadAction): UploadState => {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, inputMode: action.mode };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_URL":
      return { ...state, urlInput: action.url };
    case "SET_AUTH":
      return { ...state, authConfig: action.config };
    case "SET_JSON_DETECTED":
      return { ...state, jsonDetected: action.detected };
    case "RESET_URL_STATE":
      return { ...state, error: null, urlInput: "" };
  }
};

export const StepUpload = ({ className }: Readonly<StepUploadProps>) => {
  const t = useTranslations("Ingest");
  const {
    file,
    sheets,
    sourceUrl,
    editMode,
    authConfig: storeAuthConfig,
    nextStep,
    loadFile,
    setSourceUrlInput,
    jsonApiConfig,
    setJsonApiInput,
    unloadFile,
  } = useWizardUploadStepState();
  const canProceed = useWizardCanProceed();

  const [state, dispatch] = useReducer(uploadReducer, {
    inputMode: sourceUrl != null || editMode ? "url" : "file",
    error: null,
    // Step components unmount on navigation: a persisted jsonApiConfig means a
    // JSON API URL was already fetched — without this the config panel
    // vanished after back-navigation/reload while still being submitted.
    jsonDetected: jsonApiConfig != null,
    urlInput: sourceUrl ?? "",
    authConfig: storeAuthConfig ?? DEFAULT_AUTH_CONFIG,
  });

  const { inputMode, error, jsonDetected, urlInput, authConfig } = state;

  const uploadMutation = usePreviewSchemaUploadMutation();
  const urlMutation = usePreviewSchemaUrlMutation();

  const handleInputModeChange = (value: string) => {
    dispatch({ type: "SET_MODE", mode: value as InputMode });
  };

  const processFile = async (selectedFile: File) => {
    dispatch({ type: "SET_ERROR", error: null });

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const data = await uploadMutation.mutateAsync(formData);

      loadFile({
        file: { name: selectedFile.name, size: selectedFile.size, mimeType: selectedFile.type },
        sheets: data.sheets,
        previewId: data.previewId,
        configSuggestions: data.configSuggestions,
      });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err instanceof Error ? err.message : t("failedToProcessFile") });
    }
  };

  const processUrl = async () => {
    if (!urlInput.trim()) {
      dispatch({ type: "SET_ERROR", error: t("pleaseEnterUrl") });
      return;
    }

    dispatch({ type: "SET_ERROR", error: null });

    try {
      const authPayload = authConfig.type === "none" ? undefined : authConfig;

      const data = await urlMutation.mutateAsync({
        sourceUrl: urlInput.trim(),
        authConfig: authPayload,
        recordsPath: jsonApiConfig?.recordsPath,
      });

      setSourceUrlInput(urlInput.trim(), authConfig.type === "none" ? null : authConfig);

      // Detect JSON conversion and store config
      dispatch({ type: "SET_JSON_DETECTED", detected: !!data.wasConverted });
      if (data.wasConverted && !jsonApiConfig) {
        setJsonApiInput({ wasAutoDetected: true });
      } else if (!data.wasConverted && jsonApiConfig) {
        // The source is no longer JSON (e.g. URL swapped to a CSV) — clear the
        // persisted config so the JSON panel doesn't resurrect on remount and
        // stale recordsPath/pagination settings don't get saved for a CSV.
        setJsonApiInput(null);
      }

      loadFile({
        file: { name: data.fileName, size: data.contentLength, mimeType: data.contentType },
        sheets: data.sheets,
        previewId: data.previewId,
        sourceUrl: urlInput.trim(),
        configSuggestions: data.configSuggestions,
      });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err instanceof Error ? err.message : t("failedToFetchUrl") });
    }
  };

  const handleRemoveFile = () => {
    unloadFile();
    dispatch({ type: "RESET_URL_STATE" });
  };

  const handleFetchClick = () => {
    void processUrl();
  };

  const urlInputForm = (
    <UrlInputForm
      urlInput={urlInput}
      onUrlInputChange={(url) => dispatch({ type: "SET_URL", url })}
      onFetch={handleFetchClick}
      isPending={urlMutation.isPending}
      authConfig={authConfig}
      onAuthConfigChange={(config) => dispatch({ type: "SET_AUTH", config })}
    />
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-foreground font-serif text-3xl font-bold">{t("uploadTitle")}</h2>
        <p className="text-muted-foreground mt-2">{t("uploadDescription")}</p>
      </div>

      {/* Edit mode info banner */}
      {editMode && !file && (
        <div className="bg-primary/5 border-primary/20 rounded-lg border p-4 text-sm">{t("refetchRequired")}</div>
      )}

      {/* Show preview if file is already loaded */}
      {file && (
        <>
          <UploadPreviewCard file={file} sourceUrl={sourceUrl} sheets={sheets} onRemove={handleRemoveFile} />
          {jsonDetected && sourceUrl && (
            <JsonApiConfigPanel
              jsonApiConfig={jsonApiConfig}
              onConfigChange={setJsonApiInput}
              onReload={handleFetchClick}
              isReloading={urlMutation.isPending}
            />
          )}
        </>
      )}

      {/* No file loaded: show input mode selector */}
      {!file && editMode && urlInputForm}

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
            <FileDropZone isPending={uploadMutation.isPending} onFile={(selected) => void processFile(selected)} />
          </TabsContent>
          <TabsContent value="url" className="mt-4">
            {urlInputForm}
          </TabsContent>
        </Tabs>
      )}

      {/* Error message */}
      {error && (
        // role="alert" so a screen reader announces the failure instead of leaving
        // the user waiting on a silently rendered box.
        <div role="alert" className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Sticky continue footer */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm", canProceed ? "text-accent" : "text-muted-foreground")}>
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
