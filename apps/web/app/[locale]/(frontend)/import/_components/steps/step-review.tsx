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

import { Button, Card, CardContent, CardHeader, CardTitle } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowDownIcon,
  ArrowLeft,
  CalendarIcon,
  DatabaseIcon,
  FingerprintIcon,
  FolderIcon,
  Loader2,
  MapPinIcon,
  Rocket,
  SparklesIcon,
  TextIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { useImportConfigureMutation } from "@/lib/hooks/use-import-wizard-mutations";
import { TRANSFORM_TYPE_LABELS } from "@/lib/types/import-transforms";
import { formatFileSize } from "@/lib/utils/format";

import { useWizardStore } from "../wizard-store";
// Schedule config is now in step-schedule.tsx (Step 5)

export interface StepReviewProps {
  className?: string;
}

export const StepReview = ({ className }: Readonly<StepReviewProps>) => {
  const t = useTranslations("Import");
  const file = useWizardStore((s) => s.file);
  const sheets = useWizardStore((s) => s.sheets);
  const selectedCatalogId = useWizardStore((s) => s.selectedCatalogId);
  const newCatalogName = useWizardStore((s) => s.newCatalogName);
  const sheetMappings = useWizardStore((s) => s.sheetMappings);
  const fieldMappings = useWizardStore((s) => s.fieldMappings);
  const deduplicationStrategy = useWizardStore((s) => s.deduplicationStrategy);
  const geocodingEnabled = useWizardStore((s) => s.geocodingEnabled);
  const sourceUrl = useWizardStore((s) => s.sourceUrl);
  const authConfig = useWizardStore((s) => s.authConfig);
  const scheduleConfig = useWizardStore((s) => s.scheduleConfig);
  const jsonApiConfig = useWizardStore((s) => s.jsonApiConfig);
  const wizardPreviewId = useWizardStore((s) => s.previewId);
  const wizardTransforms = useWizardStore((s) => s.transforms);
  const wizardError = useWizardStore((s) => s.error);
  const prevStep = useWizardStore((s) => s.prevStep);
  const startProcessing = useWizardStore((s) => s.startProcessing);
  const nextStep = useWizardStore((s) => s.nextStep);
  const setError = useWizardStore((s) => s.setError);
  const ID_STRATEGY_LABELS: Record<string, string> = {
    auto: t("idStrategyAuto"),
    external: t("idStrategyExternal"),
    computed: t("idStrategyComputed"),
    hybrid: t("idStrategyHybrid"),
  };

  const DUPLICATE_LABELS: Record<string, string> = {
    skip: t("dedupSkip"),
    update: t("dedupUpdate"),
    version: t("dedupVersion"),
  };

  const configureMutation = useImportConfigureMutation();

  // useCallback required: used in useEffect dependency array below
  const handleStartImport = useCallback(async () => {
    setError(null);

    try {
      const createSchedule =
        sourceUrl && scheduleConfig?.enabled
          ? {
              enabled: true as const,
              sourceUrl,
              name: scheduleConfig.name,
              scheduleType: scheduleConfig.scheduleType,
              frequency: scheduleConfig.scheduleType === "frequency" ? scheduleConfig.frequency : undefined,
              cronExpression: scheduleConfig.scheduleType === "cron" ? scheduleConfig.cronExpression : undefined,
              schemaMode: scheduleConfig.schemaMode,
              authConfig: authConfig ?? undefined,
              jsonApiConfig: jsonApiConfig ?? undefined,
            }
          : undefined;

      // Build transforms payload from wizard state
      const transformsPayload = Object.entries(wizardTransforms)
        .filter(([, t]) => t.length > 0)
        .map(([idx, transforms]) => ({ sheetIndex: Number(idx), transforms }));

      if (selectedCatalogId == null) {
        setError(t("pleaseSelectCatalog"));
        return;
      }

      const data = await configureMutation.mutateAsync({
        previewId: wizardPreviewId ?? "",
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
      setError(err instanceof Error ? err.message : t("failedToStartImport"));
    }
  }, [
    sourceUrl,
    scheduleConfig,
    jsonApiConfig,
    authConfig,
    wizardTransforms,
    wizardPreviewId,
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
    t,
  ]);

  // Get catalog and dataset names for display
  const catalogName = selectedCatalogId === "new" ? newCatalogName : t("catalogNumber", { id: selectedCatalogId ?? 0 });

  // Get all dataset names for multi-sheet imports
  const datasetNames = sheetMappings.map((mapping) =>
    mapping.datasetId === "new" ? mapping.newDatasetName : t("datasetNumber", { id: mapping.datasetId })
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
      sheetMapping?.datasetId === "new"
        ? sheetMapping.newDatasetName
        : t("datasetNumber", { id: sheetMapping?.datasetId ?? 0 });
    return {
      mapping,
      datasetName: datasetName ?? sheet?.name ?? t("sheetNumber", { number: mapping.sheetIndex + 1 }),
      sheetName: sheet?.name,
    };
  });

  const totalRows = sheets.reduce((sum, s) => sum + s.rowCount, 0);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("reviewTitle")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("reviewDescription")}</p>
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
                  {t("rowCount", { count: totalRows.toLocaleString() })}
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
                  <p className="text-cartographic-navy/50 text-xs">{t("catalog")}</p>
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
                    {isMultiDataset ? t("datasetsCount", { count: datasetCount }) : t("dataset")}
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

      {/* Field Mappings + Record Handling */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("fieldMappings")}</h3>
        </div>
        <CardContent className="p-6">
          <div className="space-y-6">
            {mappingsWithDataset.map(({ mapping, datasetName }, idx) => {
              const locationDisplay = getLocationDisplay(mapping);
              return (
                <div key={mapping.sheetIndex} data-testid={`field-mapping-${mapping.sheetIndex}`}>
                  {isMultiDataset && (
                    <p className="text-cartographic-charcoal mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                  )}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TextIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">{t("fieldTitle")}</span>
                      </div>
                      <span className="text-cartographic-charcoal font-mono text-sm" data-testid="title-field">
                        {mapping?.titleField ?? "\u2014"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">{t("fieldDate")}</span>
                      </div>
                      <span className="text-cartographic-charcoal font-mono text-sm" data-testid="date-field">
                        {mapping?.dateField ?? "\u2014"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPinIcon className="text-cartographic-navy/40 h-4 w-4" />
                        <span className="text-cartographic-navy/70 text-sm">{t("location")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-cartographic-charcoal font-mono text-sm" data-testid="location-field">
                          {locationDisplay ?? "\u2014"}
                        </span>
                        {geocodingEnabled && locationDisplay && (
                          <span className="bg-cartographic-forest/10 text-cartographic-forest inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs">
                            <SparklesIcon className="h-3 w-3" />
                            {t("geocode")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isMultiDataset && idx < mappingsWithDataset.length - 1 && (
                    <div className="border-cartographic-navy/10 mt-4 border-t" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Record Handling */}
          <div className="border-cartographic-navy/10 mt-6 border-t pt-6">
            <h4 className="text-cartographic-charcoal mb-4 font-serif text-base font-semibold">
              {t("recordHandling")}
            </h4>
            <div className="space-y-6">
              {mappingsWithDataset.map(({ mapping, datasetName }, idx) => (
                <div key={mapping.sheetIndex} data-testid={`record-handling-${mapping.sheetIndex}`}>
                  {isMultiDataset && (
                    <p className="text-cartographic-charcoal mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FingerprintIcon className="text-cartographic-navy/40 h-4 w-4" />
                      <span className="text-cartographic-navy/70 text-sm">{t("identifyBy")}</span>
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
              <div className="border-cartographic-navy/10 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DatabaseIcon className="text-cartographic-navy/40 h-4 w-4" />
                    <span className="text-cartographic-navy/70 text-sm">{t("onDuplicate")}</span>
                  </div>
                  <span className="text-cartographic-charcoal font-mono text-sm">
                    {DUPLICATE_LABELS[deduplicationStrategy]}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transforms summary */}
      {Object.values(wizardTransforms).some((transforms) => transforms.length > 0) && (
        <Card className="overflow-hidden">
          <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
            <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("configuredTransforms")}</h3>
          </div>
          <CardContent className="p-6">
            <div className="space-y-2">
              {Object.entries(wizardTransforms)
                .filter(([, transforms]) => transforms.length > 0)
                .flatMap(([, transforms]) => transforms)
                .map((transform) => (
                  <div key={transform.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium",
                        transform.active
                          ? "bg-cartographic-blue/10 text-cartographic-blue"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {TRANSFORM_TYPE_LABELS[transform.type]}
                    </span>
                    <span className="text-cartographic-navy/70 font-mono text-sm">
                      {"from" in transform ? transform.from : ""}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule summary (configured in Step 5) */}
      {sourceUrl && scheduleConfig?.enabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("scheduled")}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <p>
              {scheduleConfig.scheduleType === "frequency"
                ? `${t("frequency")}: ${t(scheduleConfig.frequency)}`
                : `${t("cronExpression")}: ${scheduleConfig.cronExpression}`}
            </p>
            <p>
              {t("schemaChangeHandling")}:{" "}
              {t(
                `schema${scheduleConfig.schemaMode.charAt(0).toUpperCase()}${scheduleConfig.schemaMode.slice(1)}` as
                  | "schemaStrict"
                  | "schemaAdditive"
                  | "schemaFlexible"
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {wizardError && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{wizardError}</div>}

      {/* Sticky footer with Back + Start Import */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevStep} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("backToMapping")}
          </Button>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-sm",
                !configureMutation.isPending ? "text-cartographic-forest" : "text-cartographic-navy/50"
              )}
            >
              {t("readyToStart")}
            </span>
            <Button
              size="lg"
              onClick={() => void handleStartImport()}
              disabled={configureMutation.isPending}
              className="gap-2"
            >
              {configureMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {t("startImport")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
