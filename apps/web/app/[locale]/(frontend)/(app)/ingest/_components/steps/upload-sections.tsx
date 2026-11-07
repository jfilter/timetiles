/**
 * Presentational parts of the import wizard's upload step: the file drop
 * zone, the URL form and the preview of loaded data.
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
} from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
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

import type { SheetInfo, UrlAuthConfig } from "@/lib/ingest/types/wizard";
import { formatFileSize } from "@/lib/utils/format";

import { AuthConfigFields } from "../auth-config-fields";
import type { WizardState } from "../wizard-state";

const ACCEPTED_TYPES = [
  "text/csv",
  "application/json",
  "application/geo+json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  ".csv",
  ".json",
  ".geojson",
  ".xls",
  ".xlsx",
  ".ods",
];

/** Drag-and-drop area with a file picker fallback. */
export const FileDropZone = ({ isPending, onFile }: { isPending: boolean; onFile: (file: File) => void }) => {
  const t = useTranslations("Ingest");
  const [isDragging, setIsDragging] = useState(false);

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
    if (droppedFile) onFile(droppedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    // Clear the input so re-selecting the SAME file fires a change event
    // again — after a failed upload the input stays mounted with its value
    // set, and retrying with the same file would otherwise do nothing.
    e.target.value = "";
    if (selectedFile) onFile(selectedFile);
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-12 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        isPending && "pointer-events-none opacity-50"
      )}
      role="presentation"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isPending ? (
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
};

/** Source URL input with fetch button and collapsible auth settings. */
export const UrlInputForm = ({
  urlInput,
  onUrlInputChange,
  onFetch,
  isPending,
  authConfig,
  onAuthConfigChange,
}: {
  urlInput: string;
  onUrlInputChange: (url: string) => void;
  onFetch: () => void;
  isPending: boolean;
  authConfig: UrlAuthConfig;
  onAuthConfigChange: (config: UrlAuthConfig) => void;
}) => {
  const t = useTranslations("Ingest");

  return (
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
            onChange={(e) => onUrlInputChange(e.target.value)}
            disabled={isPending}
            className="flex-1"
          />
          <Button type="button" onClick={onFetch} disabled={isPending || !urlInput.trim()}>
            {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : t("fetch")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t("dataUrlDescription")}</p>
      </div>

      {/* Auth Configuration */}
      <Collapsible>
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground py-2 text-sm font-medium">
          {t("authSettings")}
          <ChevronDownIcon className="h-4 w-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-4">
            <AuthConfigFields authConfig={authConfig} onAuthConfigChange={onAuthConfigChange} />
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

/** Card summarizing the loaded file or URL data, with a remove button. */
export const UploadPreviewCard = ({
  file,
  sourceUrl,
  sheets,
  onRemove,
}: {
  file: NonNullable<WizardState["file"]>;
  sourceUrl: string | null;
  sheets: SheetInfo[];
  onRemove: () => void;
}) => {
  const t = useTranslations("Ingest");

  return (
    <Card className="overflow-hidden">
      {/* Success header bar */}
      <div className="bg-accent/10 border-accent/20 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="text-accent h-4 w-4" />
          <span className="text-accent text-sm font-medium">{sourceUrl ? t("urlDataReady") : t("fileReady")}</span>
        </div>
      </div>

      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* File info */}
          <div className="flex items-start gap-4">
            <div className="bg-card border-primary/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border">
              {sourceUrl ? (
                <GlobeIcon className="text-primary h-6 w-6" />
              ) : (
                <FileSpreadsheetIcon className="text-primary h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-foreground truncate font-serif text-lg font-medium">{file.name}</h3>
              {sourceUrl && <p className="text-muted-foreground truncate font-mono text-xs">{sourceUrl}</p>}
              <div className="text-muted-foreground flex items-center gap-3 font-mono text-sm">
                {file.size > 0 && (
                  <>
                    <span>{formatFileSize(file.size)}</span>
                    <span className="text-primary/30">·</span>
                  </>
                )}
                {sheets.length === 1 ? (
                  <span>{t("rowCount", { count: sheets[0]?.rowCount ?? 0 })}</span>
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
            onClick={onRemove}
            aria-label={t("removeFile")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Multi-sheet details */}
        {sheets.length > 1 && (
          <div className="border-primary/10 mt-4 border-t pt-4">
            <p className="text-foreground mb-2 text-sm font-medium">{t("sheets")}</p>
            <ul className="space-y-1">
              {sheets.map((sheet) => (
                <li key={sheet.index} className="bg-card/50 flex items-center justify-between rounded-sm px-3 py-2">
                  <span className="text-foreground text-sm">{sheet.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {t("rowCount", { count: sheet.rowCount })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
