/**
 * Review step for the import wizard.
 *
 * Shows a summary of all configuration before starting the import.
 * Organized into clear sections: data flow, field mappings, record handling.
 *
 * @module
 * @category Components
 */
/* eslint-disable complexity -- Review component displays many configuration sections */
"use client";

import { Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowDownIcon,
  CalendarIcon,
  DatabaseIcon,
  FingerprintIcon,
  FolderIcon,
  MapPinIcon,
  SparklesIcon,
  TextIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useWizard } from "../wizard-context";

export interface StepReviewProps {
  className?: string;
}

const ID_STRATEGY_LABELS: Record<string, string> = {
  auto: "Auto-generated",
  external: "From column",
  computed: "Content hash",
  hybrid: "External + fallback",
};

const DUPLICATE_LABELS: Record<string, string> = {
  skip: "Skip",
  update: "Update",
  version: "New version",
};

// eslint-disable-next-line complexity -- Review component displays many configuration sections
export const StepReview = ({ className }: Readonly<StepReviewProps>) => {
  const { state, startProcessing, nextStep, setError, setNavigationConfig } = useWizard();
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

  // Handle the import start - called from navigation
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

  // Configure navigation for this step
  useEffect(() => {
    setNavigationConfig({
      onNext: handleStartImport,
      nextLabel: "Start Import",
      isLoading: isSubmitting,
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig, handleStartImport, isSubmitting]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get catalog and dataset names for display
  const catalogName = selectedCatalogId === "new" ? newCatalogName : `Catalog #${selectedCatalogId}`;

  // Get all dataset names for multi-sheet imports
  const datasetNames = sheetMappings.map((mapping) =>
    mapping.datasetId === "new" ? mapping.newDatasetName : `Dataset #${mapping.datasetId}`
  );
  const datasetCount = sheetMappings.length;
  const isMultiDataset = datasetCount > 1;

  // Format location display for a specific mapping
  const getLocationDisplay = (mapping: (typeof fieldMappings)[0] | undefined) => {
    if (mapping?.locationField) {
      return mapping.locationField;
    }
    if (mapping?.latitudeField && mapping?.longitudeField) {
      return `${mapping.latitudeField}, ${mapping.longitudeField}`;
    }
    return null;
  };

  // Get field mappings paired with their sheet/dataset info for display
  const mappingsWithDataset = fieldMappings.map((mapping) => {
    const sheetMapping = sheetMappings.find((sm) => sm.sheetIndex === mapping.sheetIndex);
    const sheet = sheets.find((s) => s.index === mapping.sheetIndex);
    const datasetName =
      sheetMapping?.datasetId === "new" ? sheetMapping.newDatasetName : `Dataset #${sheetMapping?.datasetId}`;
    return {
      mapping,
      datasetName: datasetName ?? sheet?.name ?? `Sheet ${mapping.sheetIndex + 1}`,
      sheetName: sheet?.name,
    };
  });

  const totalRows = sheets.reduce((sum, s) => sum + s.rowCount, 0);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Review your import</h2>
        <p className="text-cartographic-navy/70 mt-2">Confirm your settings before starting the import.</p>
      </div>

      {/* Data Flow: Source → Destination */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Source file */}
          <div className="border-cartographic-navy/10 border-b p-6">
            <div className="flex items-start gap-4">
              <div className="bg-cartographic-navy/5 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
                <DatabaseIcon className="text-cartographic-navy h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-cartographic-charcoal truncate font-serif text-lg font-semibold">{file?.name}</p>
                <p className="text-cartographic-navy/60 mt-1 font-mono text-sm">
                  {file ? formatFileSize(file.size) : "-"}
                  <span className="text-cartographic-navy/30 mx-2">•</span>
                  {totalRows.toLocaleString()} rows
                </p>
              </div>
            </div>
          </div>

          {/* Arrow connector */}
          <div className="bg-cartographic-cream/20 flex justify-center py-3">
            <ArrowDownIcon className="text-cartographic-navy/30 h-5 w-5" />
          </div>

          {/* Destination */}
          <div className="divide-cartographic-navy/10 grid grid-cols-2 divide-x">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="bg-cartographic-terracotta/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
                  <FolderIcon className="text-cartographic-terracotta h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-cartographic-navy/50 text-xs">Catalog</p>
                  <p className="text-cartographic-charcoal truncate font-serif font-semibold">{catalogName}</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="bg-cartographic-blue/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
                  <DatabaseIcon className="text-cartographic-blue h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-cartographic-navy/50 text-xs">
                    {isMultiDataset ? `${datasetCount} datasets` : "Dataset"}
                  </p>
                  {isMultiDataset ? (
                    <div className="space-y-1">
                      {datasetNames.map((name, idx) => (
                        <p key={idx} className="text-cartographic-charcoal truncate font-serif text-sm font-medium">
                          {name}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-cartographic-charcoal truncate font-serif font-semibold">{datasetNames[0]}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Mappings */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Field mappings</h3>
        </div>
        <CardContent className="p-6">
          <div className="space-y-6">
            {mappingsWithDataset.map(({ mapping, datasetName }, idx) => {
              const locationDisplay = getLocationDisplay(mapping);
              return (
                <div key={mapping.sheetIndex} data-testid={`field-mapping-${mapping.sheetIndex}`}>
                  {/* Show dataset name header for multi-sheet imports */}
                  {isMultiDataset && (
                    <p className="text-cartographic-charcoal mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                  )}
                  <div className="space-y-3">
                    {/* Title */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TextIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">Title</span>
                      </div>
                      <span className="text-cartographic-charcoal font-mono text-sm" data-testid="title-field">
                        {mapping?.titleField ?? "—"}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">Date</span>
                      </div>
                      <span className="text-cartographic-charcoal font-mono text-sm" data-testid="date-field">
                        {mapping?.dateField ?? "—"}
                      </span>
                    </div>

                    {/* Location */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPinIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">Location</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-cartographic-charcoal font-mono text-sm" data-testid="location-field">
                          {locationDisplay ?? "—"}
                        </span>
                        {geocodingEnabled && locationDisplay && (
                          <span className="bg-cartographic-forest/10 text-cartographic-forest inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs">
                            <SparklesIcon className="h-3 w-3" />
                            Geocode
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Divider between sheets */}
                  {isMultiDataset && idx < mappingsWithDataset.length - 1 && (
                    <div className="border-cartographic-navy/10 mt-4 border-t" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Record Handling: ID Strategy + Duplicates */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Record handling</h3>
        </div>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Per-sheet ID Strategy */}
            {mappingsWithDataset.map(({ mapping, datasetName }, idx) => (
              <div key={mapping.sheetIndex} data-testid={`record-handling-${mapping.sheetIndex}`}>
                {isMultiDataset && (
                  <p className="text-cartographic-charcoal mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FingerprintIcon className="text-cartographic-navy/40 h-4 w-4" />
                    <span className="text-cartographic-navy/70 text-sm">Identify by</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cartographic-charcoal font-mono text-sm">
                      {ID_STRATEGY_LABELS[mapping?.idStrategy ?? "auto"]}
                    </span>
                    {mapping?.idStrategy === "external" && mapping?.idField && (
                      <span className="text-cartographic-navy/50 font-mono text-xs">({mapping.idField})</span>
                    )}
                  </div>
                </div>
                {isMultiDataset && idx < mappingsWithDataset.length - 1 && (
                  <div className="border-cartographic-navy/10 mt-4 border-t" />
                )}
              </div>
            ))}

            {/* Duplicate handling (global setting) */}
            <div className="border-cartographic-navy/10 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DatabaseIcon className="text-cartographic-navy/40 h-4 w-4" />
                  <span className="text-cartographic-navy/70 text-sm">On duplicate</span>
                </div>
                <span className="text-cartographic-charcoal font-mono text-sm">
                  {DUPLICATE_LABELS[deduplicationStrategy]}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{state.error}</div>}
    </div>
  );
};
