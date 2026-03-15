/**
 * Review step for the import wizard.
 *
 * Shows a summary of all configuration before starting the import.
 * Organized into clear sections: data flow, field mappings, record handling.
 * Shows schedule configuration when importing from a URL.
 *
 * @module
 * @category Components
 */

"use client";

import { Button, Card, CardContent, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowDownIcon,
  CalendarIcon,
  ClockIcon,
  DatabaseIcon,
  FingerprintIcon,
  FolderIcon,
  GlobeIcon,
  MapPinIcon,
  SparklesIcon,
  TextIcon,
} from "lucide-react";
import { useCallback, useEffect } from "react";

import { useImportConfigureMutation } from "@/lib/hooks/use-import-wizard-mutations";
import { formatFileSize } from "@/lib/utils/format";
import { humanizeFileName } from "@/lib/utils/humanize-file-name";

import { useNavigationConfig } from "../navigation-config-context";
import type { ScheduleConfig } from "../wizard-context";
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

const DUPLICATE_LABELS: Record<string, string> = { skip: "Skip", update: "Update", version: "New version" };

// Default schedule config
const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  enabled: false,
  name: "",
  scheduleType: "frequency",
  frequency: "daily",
  cronExpression: "",
  schemaMode: "additive",
};

export const StepReview = ({ className }: Readonly<StepReviewProps>) => {
  const { state, startProcessing, nextStep, setError, setScheduleConfig } = useWizard();
  const { setNavigationConfig } = useNavigationConfig();
  const {
    file,
    sheets,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    fieldMappings,
    deduplicationStrategy,
    geocodingEnabled,
    sourceUrl,
    authConfig,
    scheduleConfig,
  } = state;

  const configureMutation = useImportConfigureMutation();

  const defaultScheduleName = file?.name ? humanizeFileName(file.name) : "";

  const getActiveScheduleConfig = (): ScheduleConfig =>
    scheduleConfig ?? { ...DEFAULT_SCHEDULE_CONFIG, name: defaultScheduleName };

  const activeScheduleConfig = getActiveScheduleConfig();

  const updateScheduleField = (updates: Partial<ScheduleConfig>) => {
    setScheduleConfig({ ...getActiveScheduleConfig(), ...updates });
  };

  const handleToggleScheduleEnabled = () => {
    if (scheduleConfig?.enabled) {
      setScheduleConfig(null);
    } else {
      setScheduleConfig({ ...DEFAULT_SCHEDULE_CONFIG, name: defaultScheduleName, enabled: true });
    }
  };

  const handleScheduleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateScheduleField({ name: e.target.value });
  };

  const handleScheduleTypeChange = (value: string) => {
    updateScheduleField({ scheduleType: value as "frequency" | "cron" });
  };

  const handleFrequencyChange = (value: string) => {
    updateScheduleField({ frequency: value as "hourly" | "daily" | "weekly" | "monthly" });
  };

  const handleCronExpressionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateScheduleField({ cronExpression: e.target.value });
  };

  const handleSchemaModeChange = (value: string) => {
    updateScheduleField({ schemaMode: value as "strict" | "additive" | "flexible" });
  };

  // useCallback required: used in useEffect dependency array below
  const handleStartImport = useCallback(async () => {
    setError(null);

    try {
      const createSchedule =
        sourceUrl && activeScheduleConfig.enabled
          ? {
              enabled: true as const,
              sourceUrl,
              name: activeScheduleConfig.name,
              scheduleType: activeScheduleConfig.scheduleType,
              frequency: activeScheduleConfig.scheduleType === "frequency" ? activeScheduleConfig.frequency : undefined,
              cronExpression:
                activeScheduleConfig.scheduleType === "cron" ? activeScheduleConfig.cronExpression : undefined,
              schemaMode: activeScheduleConfig.schemaMode,
              authConfig: authConfig ?? undefined,
            }
          : undefined;

      // Build transforms payload from wizard state
      const transformsPayload = Object.entries(state.transforms)
        .filter(([, t]) => t.length > 0)
        .map(([idx, transforms]) => ({ sheetIndex: Number(idx), transforms }));

      const data = await configureMutation.mutateAsync({
        previewId: state.previewId ?? "",
        catalogId: selectedCatalogId,
        newCatalogName: selectedCatalogId === "new" ? newCatalogName : undefined,
        sheetMappings,
        fieldMappings,
        deduplicationStrategy,
        geocodingEnabled,
        transforms: transformsPayload.length > 0 ? transformsPayload : undefined,
        createSchedule,
      });

      startProcessing(data.importFileId, data.scheduledImportId);
      nextStep();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start import");
    }
  }, [
    sourceUrl,
    activeScheduleConfig,
    authConfig,
    state.transforms,
    state.previewId,
    configureMutation,
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
      isLoading: configureMutation.isPending,
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig, handleStartImport, configureMutation.isPending]);

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
                      {datasetNames.map((name) => (
                        <p key={name} className="text-cartographic-charcoal truncate font-serif text-sm font-medium">
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

      {/* Schedule Configuration (only shown when importing from URL) */}
      {sourceUrl && (
        <Card className="overflow-hidden">
          <div className="border-cartographic-navy/10 bg-cartographic-cream/30 flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <ClockIcon className="text-cartographic-navy h-5 w-5" />
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Scheduled Import</h3>
            </div>
            <Button
              type="button"
              variant={activeScheduleConfig.enabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleScheduleEnabled}
              aria-label="Enable scheduled import"
            >
              {activeScheduleConfig.enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
          {activeScheduleConfig.enabled && (
            <CardContent className="space-y-6 p-6">
              {/* Source URL display */}
              <div className="flex items-start gap-3">
                <GlobeIcon className="text-cartographic-navy/40 mt-0.5 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-cartographic-navy/70 text-xs">Source URL</p>
                  <p className="text-cartographic-charcoal truncate font-mono text-sm">{sourceUrl}</p>
                </div>
              </div>

              {/* Schedule name */}
              <div className="space-y-2">
                <Label htmlFor="schedule-name">Schedule Name</Label>
                <Input
                  id="schedule-name"
                  placeholder="My scheduled import"
                  value={activeScheduleConfig.name}
                  onChange={handleScheduleNameChange}
                />
              </div>

              {/* Schedule type and frequency */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="schedule-type">Schedule Type</Label>
                  <Select value={activeScheduleConfig.scheduleType} onValueChange={handleScheduleTypeChange}>
                    <SelectTrigger id="schedule-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="frequency">Simple frequency</SelectItem>
                      <SelectItem value="cron">Cron expression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {activeScheduleConfig.scheduleType === "frequency" ? (
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select value={activeScheduleConfig.frequency} onValueChange={handleFrequencyChange}>
                      <SelectTrigger id="frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="cron-expression">Cron Expression</Label>
                    <Input
                      id="cron-expression"
                      placeholder="0 0 * * *"
                      value={activeScheduleConfig.cronExpression}
                      onChange={handleCronExpressionChange}
                    />
                  </div>
                )}
              </div>

              {/* Schema mode */}
              <div className="space-y-2">
                <Label htmlFor="schema-mode">Schema Change Handling</Label>
                <Select value={activeScheduleConfig.schemaMode} onValueChange={handleSchemaModeChange}>
                  <SelectTrigger id="schema-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">
                      <span className="font-medium">Strict</span>
                      <span className="text-muted-foreground ml-2 text-xs">— fail if schema changes</span>
                    </SelectItem>
                    <SelectItem value="additive">
                      <span className="font-medium">Additive</span>
                      <span className="text-muted-foreground ml-2 text-xs">— auto-accept new fields</span>
                    </SelectItem>
                    <SelectItem value="flexible">
                      <span className="font-medium">Flexible</span>
                      <span className="text-muted-foreground ml-2 text-xs">— re-analyze each time</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  How to handle schema changes when the source data structure changes.
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {state.error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{state.error}</div>}
    </div>
  );
};
