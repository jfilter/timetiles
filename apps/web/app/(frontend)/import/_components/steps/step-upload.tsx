/**
 * Upload step for the import wizard.
 *
 * Provides drag-and-drop file upload with preview of detected sheets.
 * Displays file size limits based on user trust level.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { CheckCircle2Icon, FileSpreadsheetIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useWizard } from "../wizard-context";
import { WizardNavigation } from "../wizard-navigation";

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

export const StepUpload = ({ className }: Readonly<StepUploadProps>) => {
  const { state, setFile, clearFile, nextStep } = useWizard();
  const { file, sheets } = state;

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleRemoveFile = useCallback(() => {
    clearFile();
    setError(null);
  }, [clearFile]);

  const handleNext = useCallback(() => {
    nextStep();
  }, [nextStep]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Upload your data</h2>
        <p className="text-cartographic-navy/70 mt-2">Upload a CSV, Excel, or ODS file containing your event data.</p>
      </div>

      {/* Upload area or file preview */}
      {!file ? (
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
      ) : (
        <Card className="overflow-hidden">
          {/* Success header bar */}
          <div className="bg-cartographic-forest/10 border-cartographic-forest/20 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2Icon className="text-cartographic-forest h-4 w-4" />
              <span className="text-cartographic-forest text-sm font-medium">File ready for import</span>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              {/* File info */}
              <div className="flex items-start gap-4">
                <div className="bg-cartographic-cream border-cartographic-navy/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border">
                  <FileSpreadsheetIcon className="text-cartographic-navy h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-medium">{file.name}</h3>
                  <div className="text-cartographic-navy/70 flex items-center gap-3 font-mono text-sm">
                    <span>{formatFileSize(file.size)}</span>
                    <span className="text-cartographic-navy/30">·</span>
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
      )}

      {/* Error message */}
      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      <WizardNavigation onNext={handleNext} />
    </div>
  );
};
