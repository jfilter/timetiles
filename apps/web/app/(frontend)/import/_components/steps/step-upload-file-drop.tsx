/**
 * Drag-and-drop file upload zone for the import wizard upload step.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { useCallback } from "react";

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

interface FileDropZoneProps {
  isDragging: boolean;
  isUploading: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (file: File) => void;
  onFileSelect: (file: File) => void;
}

export const FileDropZone = ({
  isDragging,
  isUploading,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
}: Readonly<FileDropZoneProps>) => {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        onDrop(droppedFile);
      }
    },
    [onDrop]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        onFileSelect(selectedFile);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-12 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        isUploading && "pointer-events-none opacity-50"
      )}
      role="presentation"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
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
          <label className="mt-4 inline-block cursor-pointer" aria-label="Browse files">
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
};
