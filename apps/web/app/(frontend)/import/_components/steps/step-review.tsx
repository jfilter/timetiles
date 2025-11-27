/**
 * Review step for the import wizard.
 *
 * Shows a summary of all configuration before starting the import.
 * Allows users to configure deduplication and geocoding options.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { CalendarIcon, CheckIcon, FileSpreadsheetIcon, FolderIcon, HashIcon, MapPinIcon, TextIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useWizard } from "../wizard-context";
import { WizardNavigation } from "../wizard-navigation";

export interface StepReviewProps {
  className?: string;
}

const DEDUP_STRATEGIES = [
  { value: "skip", label: "Skip duplicates", description: "Don't import events that already exist" },
  { value: "update", label: "Update existing", description: "Update existing events with new data" },
  { value: "version", label: "Create versions", description: "Keep both old and new versions" },
] as const;

export const StepReview = ({ className }: Readonly<StepReviewProps>) => {
  const { state, setImportOptions, startProcessing, nextStep, setError } = useWizard();
  const {
    file,
    sheets,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    fieldMappings,
    deduplicationStrategy,
    geocodingEnabled,
  } = state;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDeduplicationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setImportOptions({
        deduplicationStrategy: e.target.value as typeof deduplicationStrategy,
      });
    },
    [setImportOptions]
  );

  const handleGeocodingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportOptions({ geocodingEnabled: e.target.checked });
    },
    [setImportOptions]
  );

  const handleStartImport = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/wizard/configure-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          previewId: state.previewId,
          catalogId: selectedCatalogId,
          newCatalogName: selectedCatalogId === "new" ? newCatalogName : undefined,
          sheetMappings,
          fieldMappings,
          deduplicationStrategy,
          geocodingEnabled,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start import");
      }

      const data = await response.json();
      startProcessing(data.importFileId);
      nextStep();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start import");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    state.previewId,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    fieldMappings,
    deduplicationStrategy,
    geocodingEnabled,
    startProcessing,
    nextStep,
    setError,
  ]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Review your import</h2>
        <p className="text-muted-foreground mt-2">Confirm your settings before starting the import.</p>
      </div>

      {/* File summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheetIcon className="h-5 w-5" />
            File
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Filename</dt>
              <dd className="font-medium">{file?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-medium">{file ? formatFileSize(file.size) : "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sheets</dt>
              <dd className="font-medium">{sheets.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total rows</dt>
              <dd className="font-medium">{sheets.reduce((sum, s) => sum + s.rowCount, 0).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Destination summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderIcon className="h-5 w-5" />
            Destination
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Catalog</dt>
              <dd className="font-medium">
                {selectedCatalogId === "new" ? `New: ${newCatalogName}` : `ID: ${selectedCatalogId}`}
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">Dataset mappings:</p>
            <ul className="space-y-1 text-sm">
              {sheetMappings.map((mapping) => {
                const sheet = sheets.find((s) => s.index === mapping.sheetIndex);
                return (
                  <li key={mapping.sheetIndex} className="flex items-center gap-2">
                    <CheckIcon className="text-primary h-4 w-4" />
                    <span className="text-muted-foreground">{sheet?.name}</span>
                    <span>→</span>
                    <span className="font-medium">
                      {mapping.datasetId === "new" ? `New: ${mapping.newDatasetName}` : `Dataset ${mapping.datasetId}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Field mappings summary */}
      <Card>
        <CardHeader>
          <CardTitle>Field mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fieldMappings.map((mapping) => {
            const sheet = sheets.find((s) => s.index === mapping.sheetIndex);
            return (
              <div key={mapping.sheetIndex} className="space-y-2">
                {sheets.length > 1 && <p className="text-sm font-medium">{sheet?.name}</p>}
                <dl className="grid gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <TextIcon className="text-muted-foreground h-4 w-4" />
                    <dt className="text-muted-foreground">Title:</dt>
                    <dd className="font-medium">{mapping.titleField ?? "-"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="text-muted-foreground h-4 w-4" />
                    <dt className="text-muted-foreground">Date:</dt>
                    <dd className="font-medium">{mapping.dateField ?? "-"}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="text-muted-foreground h-4 w-4" />
                    <dt className="text-muted-foreground">Location:</dt>
                    <dd className="font-medium">
                      {mapping.locationField ??
                        (mapping.latitudeField && mapping.longitudeField
                          ? `${mapping.latitudeField}, ${mapping.longitudeField}`
                          : "-")}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <HashIcon className="text-muted-foreground h-4 w-4" />
                    <dt className="text-muted-foreground">ID Strategy:</dt>
                    <dd className="font-medium">{mapping.idStrategy}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Import options */}
      <Card>
        <CardHeader>
          <CardTitle>Import options</CardTitle>
          <CardDescription>Configure how duplicates are handled and whether to geocode addresses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dedup-strategy">Duplicate handling</Label>
            <select
              id="dedup-strategy"
              value={deduplicationStrategy}
              onChange={handleDeduplicationChange}
              className="border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm"
            >
              {DEDUP_STRATEGIES.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label} - {strategy.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="geocoding-enabled"
              type="checkbox"
              checked={geocodingEnabled}
              onChange={handleGeocodingChange}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <Label htmlFor="geocoding-enabled">Enable geocoding</Label>
              <p className="text-muted-foreground text-sm">Convert addresses to coordinates for map display.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{state.error}</div>}

      <WizardNavigation onNext={handleStartImport} nextLabel="Start Import" isLoading={isSubmitting} />
    </div>
  );
};
