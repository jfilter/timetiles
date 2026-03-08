/**
 * File/URL preview card for the import wizard upload step.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { CheckCircle2Icon, FileSpreadsheetIcon, GlobeIcon, XIcon } from "lucide-react";

import type { WizardState } from "../wizard-context";

type SheetInfo = WizardState["sheets"][number];

interface UploadPreviewProps {
  file: { name: string; size: number; mimeType: string };
  sheets: SheetInfo[];
  sourceUrl?: string | null;
  onRemove: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const UploadPreview = ({ file, sheets, sourceUrl, onRemove }: Readonly<UploadPreviewProps>) => (
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
            <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-medium">{file.name}</h3>
            {sourceUrl && <p className="text-cartographic-navy/50 truncate font-mono text-xs">{sourceUrl}</p>}
            <div className="text-cartographic-navy/70 flex items-center gap-3 font-mono text-sm">
              {file.size > 0 && (
                <>
                  <span>{formatFileSize(file.size)}</span>
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
          onClick={onRemove}
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
