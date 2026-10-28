/**
 * Dataset selection step for the import wizard.
 *
 * Allows users to select a catalog and choose target datasets
 * for each detected sheet. Shows schema similarity suggestions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowRight, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useCatalogsQuery } from "@/lib/hooks/use-catalogs-query";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardDatasetSelectionStepState } from "../wizard-store";
import {
  CatalogSection,
  DatasetSuggestionBanner,
  SheetDatasetCard,
  SingleSheetDatasetForm,
} from "./dataset-selection-sections";

export interface StepDatasetSelectionProps {
  className?: string;
}

/** Stable empty array to avoid creating a new reference on each render. */
const EMPTY_DATASETS: Array<{ id: number; name: string }> = [];

export const StepDatasetSelection = ({ className }: Readonly<StepDatasetSelectionProps>) => {
  const t = useTranslations("Ingest");
  const {
    sheets,
    selectedCatalogId,
    newCatalogName,
    sheetMappings,
    configSuggestions,
    fileName,
    nextStep,
    selectCatalog,
    setDatasetTarget,
    applyDatasetSelectionSuggestion,
    applyFieldMappingSuggestion,
  } = useWizardDatasetSelectionStepState();
  const canProceed = useWizardCanProceed();

  const { data: catalogsData, isLoading, error: queryError } = useCatalogsQuery();
  const catalogsList = catalogsData?.catalogs;
  const catalogs = catalogsList ?? [];
  const errorMessage = queryError instanceof Error ? queryError.message : t("failedToLoadCatalogs");
  const error = queryError ? errorMessage : null;

  // Derive a clean catalog name from the uploaded file name
  const suggestedCatalogName = fileName ? humanizeFileName(fileName) : "";

  // UI initialization only: when the user has no catalogs yet, default to
  // "new catalog" so the catalog-name input is visible immediately. Match-
  // based auto-application of dataset-config suggestions is intentionally
  // user-initiated (see the suggested banner below).
  useEffect(() => {
    if (isLoading || selectedCatalogId !== null) return;
    if (!catalogsList || catalogsList.length === 0) {
      selectCatalog("new", suggestedCatalogName);
    }
  }, [catalogsList, selectedCatalogId, isLoading, selectCatalog, suggestedCatalogName]);

  // Track whether the user has explicitly applied or dismissed the suggestion
  // banner. Both are wizard-session-local and reset when the user reloads.
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Best dataset-config suggestion (≥60% match) whose catalog is loaded.
  const bestSuggestion = useMemo(() => {
    const goodSuggestions = configSuggestions.filter((s) => s.score >= 60);
    if (goodSuggestions.length === 0 || !catalogsList || catalogsList.length === 0) return null;
    const candidate = goodSuggestions[0];
    if (!candidate) return null;
    return catalogsList.some((c) => c.id === candidate.catalogId) ? candidate : null;
  }, [configSuggestions, catalogsList]);

  // Compute per-sheet dataset matches for the suggestion (used by both the
  // banner click handler and applied-state detection).
  const sheetMatches = useMemo(() => {
    if (!bestSuggestion) return [];
    const goodSuggestions = configSuggestions.filter((s) => s.score >= 60);
    return sheets
      .map((sheet) => {
        const sheetName = sheet.name?.toLowerCase() ?? "";
        const match = goodSuggestions.find(
          (s) => s.datasetName.toLowerCase().includes(sheetName) || sheetName.includes(s.datasetName.toLowerCase())
        );
        return match ? { sheetIndex: sheet.index, datasetId: match.datasetId } : null;
      })
      .filter((m): m is { sheetIndex: number; datasetId: number } => m !== null);
  }, [bestSuggestion, configSuggestions, sheets]);

  const handleApplySuggestion = () => {
    if (!bestSuggestion) return;
    applyDatasetSelectionSuggestion({ catalogId: bestSuggestion.catalogId, sheetMatches });
    setSuggestionApplied(true);
  };

  const handleIgnoreSuggestion = () => {
    setSuggestionDismissed(true);
  };

  const handleResetSuggestion = () => {
    setSuggestionApplied(false);
    selectCatalog(null);
    // Clearing only the catalog leaves each sheet pointing at a `datasetId`
    // from the previously applied catalog. Those refs would then resurface
    // downstream (schema-drift checks, field-mapping auto-apply) against
    // datasets the user never chose.
    for (const m of sheetMappings) {
      setDatasetTarget(m.sheetIndex, { datasetId: "new" });
    }
  };

  const handleCatalogChange = (value: string) => {
    if (value === "new") {
      selectCatalog("new");
    } else {
      selectCatalog(value ? Number(value) : null);
    }
    // Same reason as handleResetSuggestion: a dataset chosen under the
    // previous catalog must not survive the switch — the import would write
    // into a dataset of a catalog the user navigated away from.
    for (const m of sheetMappings) {
      setDatasetTarget(m.sheetIndex, { datasetId: "new", similarityScore: null });
    }
  };

  const handleDatasetChange = (sheetIndex: number, value: string) => {
    setDatasetTarget(sheetIndex, { datasetId: value === "new" ? "new" : Number(value) });
  };

  const handleNewDatasetNameChange = (sheetIndex: number, name: string) => {
    setDatasetTarget(sheetIndex, { newDatasetName: name });
  };

  const handleCopyConfigFrom = (datasetId: number) => {
    const suggestion = configSuggestions.find((s) => s.datasetId === datasetId);
    if (!suggestion) return;
    // Actually copy the config — recording only the similarity score made this control a no-op.
    applyFieldMappingSuggestion(0, suggestion.config);
    setDatasetTarget(0, { similarityScore: suggestion.score / 100 });
  };

  const selectedCatalog = catalogs.find((c) => c.id === selectedCatalogId);
  const catalogDatasets = selectedCatalogId === "new" ? EMPTY_DATASETS : (selectedCatalog?.datasets ?? EMPTY_DATASETS);
  const noCatalogSelected = selectedCatalogId === null;

  // Sibling datasets for the "copy config from" dropdown (only for existing
  // catalogs, and only datasets we actually have a config suggestion for —
  // listing the rest would make picking them a silent no-op).
  const siblingDatasets = useMemo(() => {
    if (selectedCatalogId === "new" || selectedCatalogId === null) return [];
    const suggestionIds = new Set(configSuggestions.map((s) => s.datasetId));
    return (selectedCatalog?.datasets ?? []).filter((ds) => suggestionIds.has(ds.id));
  }, [selectedCatalogId, selectedCatalog, configSuggestions]);

  // Status message for the sticky footer
  const pendingStatusKey = noCatalogSelected ? "selectCatalogToContinue" : "configureDatasetToContinue";
  const statusMessageKey = canProceed ? "readyToContinue" : pendingStatusKey;

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2Icon className="text-primary h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center">
        <h2 className="text-foreground font-serif text-3xl font-bold">{t("selectDestination")}</h2>
        <p className="text-muted-foreground mt-2">{t("selectDestinationDescription")}</p>
      </div>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {bestSuggestion && (
        <DatasetSuggestionBanner
          suggestion={bestSuggestion}
          applied={suggestionApplied}
          dismissed={suggestionDismissed}
          onApply={handleApplySuggestion}
          onIgnore={handleIgnoreSuggestion}
          onReset={handleResetSuggestion}
        />
      )}

      {/* Combined catalog + dataset card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <CatalogSection
            catalogs={catalogs}
            selectedCatalogId={selectedCatalogId}
            newCatalogName={newCatalogName}
            onCatalogChange={handleCatalogChange}
            onNewCatalogNameChange={(name) => selectCatalog("new", name)}
          />

          {/* Divider */}
          <div className="border-primary/10 border-t" />

          {/* Dataset section */}
          <div className={cn("p-6", noCatalogSelected && "opacity-50")}>
            <h3 className="text-foreground mb-1 font-serif text-lg font-semibold">{t("dataset")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {sheets.length <= 1 ? t("nameYourDataset") : t("mapSheetsToDatasets")}
            </p>

            {sheets.length <= 1 ? (
              <SingleSheetDatasetForm
                sheet={sheets[0]}
                mapping={sheetMappings[0]}
                siblingDatasets={siblingDatasets}
                disabled={noCatalogSelected}
                onNameChange={handleNewDatasetNameChange}
                onCopyConfigFrom={handleCopyConfigFrom}
              />
            ) : (
              <div className="space-y-4">
                {sheets.map((sheet) => (
                  <SheetDatasetCard
                    key={sheet.index}
                    sheet={sheet}
                    mapping={sheetMappings.find((m) => m.sheetIndex === sheet.index)}
                    datasets={catalogDatasets}
                    disabled={noCatalogSelected}
                    onDatasetChange={handleDatasetChange}
                    onNameChange={handleNewDatasetNameChange}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sticky continue button */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm", canProceed ? "text-accent" : "text-muted-foreground")}>
            {t(statusMessageKey)}
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
