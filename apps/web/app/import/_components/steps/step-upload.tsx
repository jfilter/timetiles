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

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { FileSpreadsheetIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
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
  ".csv",
  ".xls",
  ".xlsx",
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
        <h2 className="text-2xl font-semibold">Upload your data</h2>
        <p className="text-muted-foreground mt-2">Upload a CSV or Excel file containing your event data.</p>
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
              <p className="text-muted-foreground mt-4 text-sm">Supported formats: CSV, XLS, XLSX</p>
            </>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg">
                <FileSpreadsheetIcon className="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">{file.name}</CardTitle>
                <CardDescription>{formatFileSize(file.size)}</CardDescription>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={handleRemoveFile} aria-label="Remove file">
              <XIcon className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Detected {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}:
              </p>
              <ul className="text-muted-foreground space-y-1 text-sm">
                {sheets.map((sheet) => (
                  <li key={sheet.index} className="flex items-center gap-2">
                    <FileSpreadsheetIcon className="h-4 w-4" />
                    <span>{sheet.name}</span>
                    <span className="text-xs">({sheet.rowCount.toLocaleString()} rows)</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error message */}
      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      <WizardNavigation onNext={handleNext} />
    </div>
  );
};
