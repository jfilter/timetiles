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

import { Button, Card, CardContent, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowRight, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useCatalogsQuery } from "@/lib/hooks/use-catalogs-query";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardDatasetSelectionStepState } from "../wizard-store";

export interface StepDatasetSelectionProps {
  className?: string;
}

/** Stable empty array to avoid creating a new reference on each render. */
const EMPTY_DATASETS: Array<{ id: number; name: string }> = [];

interface DatasetSelectProps {
  sheetIndex: number;
  value: number | "new";
  datasets: Array<{ id: number; name: string }>;
  disabled?: boolean;
  onDatasetChange: (sheetIndex: number, value: string) => void;
}

const DatasetSelect = ({ sheetIndex, value, datasets, disabled, onDatasetChange }: Readonly<DatasetSelectProps>) => {
  const t = useTranslations("Ingest");

  const handleChange = (selected: string) => {
    onDatasetChange(sheetIndex, selected);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-${sheetIndex}`}>{t("targetDataset")}</Label>
      <Select value={value === "new" ? "new" : String(value)} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id={`dataset-${sheetIndex}`} className="h-11">
          <SelectValue placeholder={t("createNewDataset")} />
        </SelectTrigger>
        <SelectContent>
          {/* Same reasoning as catalog "create new" — top of list so it stays
              visible regardless of how many existing datasets the user has. */}
          <SelectItem value="new">{t("createNewDataset")}</SelectItem>
          {datasets.map((dataset) => (
            <SelectItem key={dataset.id} value={String(dataset.id)}>
              {dataset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface DatasetNameInputProps {
  sheetIndex: number;
  value: string;
  disabled?: boolean;
  onNameChange: (sheetIndex: number, name: string) => void;
}

const DatasetNameInput = ({ sheetIndex, value, disabled, onNameChange }: Readonly<DatasetNameInputProps>) => {
  const t = useTranslations("Ingest");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onNameChange(sheetIndex, e.target.value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-name-${sheetIndex}`}>{t("datasetName")}</Label>
      <Input
        id={`dataset-name-${sheetIndex}`}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={t("enterDatasetName")}
        disabled={disabled}
      />
    </div>
  );
};

// oxlint-disable-next-line eslint(complexity) -- wizard step with many conditional UI branches
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
  };

  const handleNewCatalogNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectCatalog("new", e.target.value);
  };

  const handleDatasetChange = (sheetIndex: number, value: string) => {
    setDatasetTarget(sheetIndex, { datasetId: value === "new" ? "new" : Number(value) });
  };

  const handleNewDatasetNameChange = (sheetIndex: number, name: string) => {
    setDatasetTarget(sheetIndex, { newDatasetName: name });
  };

  // Callback for single sheet case (index 0) to avoid inline function in JSX
  const handleSingleSheetNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleNewDatasetNameChange(0, e.target.value);
  };

  const selectedCatalog = catalogs.find((c) => c.id === selectedCatalogId);
  const noCatalogSelected = selectedCatalogId === null;

  // Sibling datasets for the "copy config from" dropdown (only for existing catalogs with datasets)
  const siblingDatasets = useMemo(() => {
    if (selectedCatalogId === "new" || selectedCatalogId === null) return [];
    return selectedCatalog?.datasets ?? [];
  }, [selectedCatalogId, selectedCatalog]);

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

      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      {/* Suggestion banner: prompt the user to apply a server-detected match.
          Applying is explicit (button click) so we never silently mutate
          wizard state from a fuzzy server match. */}
      {bestSuggestion && !suggestionApplied && !suggestionDismissed && (
        <div
          className="border-ring/20 bg-ring/5 flex items-center justify-between rounded-sm border px-4 py-3"
          data-testid="dataset-suggestion-banner"
        >
          <span className="text-ring text-sm">
            {t("similarConfig", { name: bestSuggestion.datasetName, score: bestSuggestion.score })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleIgnoreSuggestion}>
              {t("ignoreSuggestion")}
            </Button>
            <Button size="sm" onClick={handleApplySuggestion}>
              {t("useThisConfig")}
            </Button>
          </div>
        </div>
      )}

      {/* Applied banner: shown after the user clicks "Use this config".
          Reset clears catalog + sheet mappings and returns to the suggested
          banner state. */}
      {suggestionApplied && bestSuggestion && (
        <div
          className="border-accent/20 bg-accent/5 flex items-center justify-between rounded-sm border px-4 py-3"
          data-testid="dataset-suggestion-applied"
        >
          <span className="text-accent text-sm">
            {t("configLoadedFromDataset", { name: bestSuggestion.datasetName })}
          </span>
          <Button variant="ghost" size="sm" onClick={handleResetSuggestion}>
            {t("resetToAutoDetected")}
          </Button>
        </div>
      )}

      {/* Combined catalog + dataset card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Catalog section */}
          <div className="border-secondary/30 border-l-4 p-6">
            <h3 className="text-foreground mb-1 font-serif text-lg font-semibold">{t("catalog")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {catalogs.length === 0 ? t("createCatalogPrompt") : t("selectOrCreateCatalog")}
            </p>

            <div className="space-y-4">
              {/* Show dropdown only if user has existing catalogs */}
              {catalogs.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="catalog-select" className="text-foreground">
                    {t("selectCatalog")}
                  </Label>
                  <Select
                    value={selectedCatalogId === "new" ? "new" : String(selectedCatalogId ?? "")}
                    onValueChange={handleCatalogChange}
                  >
                    <SelectTrigger id="catalog-select" className="h-11">
                      <SelectValue placeholder={t("chooseCatalog")} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* "Create new catalog" stays at the top so the most common
                          action is always visible without scrolling — necessary for
                          users (and Playwright auto-scroll) when the catalog list
                          grows beyond the dropdown viewport. */}
                      <SelectItem value="new">{t("createNewCatalog")}</SelectItem>
                      {catalogs.map((catalog) => (
                        <SelectItem key={catalog.id} value={String(catalog.id)}>
                          {catalog.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(selectedCatalogId === "new" || catalogs.length === 0) && (
                <div className="space-y-2">
                  <Label htmlFor="new-catalog-name" className="text-foreground">
                    {t("catalogName")}
                  </Label>
                  <Input
                    id="new-catalog-name"
                    type="text"
                    value={newCatalogName}
                    onChange={handleNewCatalogNameChange}
                    placeholder={t("enterCatalogName")}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-primary/10 border-t" />

          {/* Dataset section */}
          <div className={cn("p-6", noCatalogSelected && "opacity-50")}>
            <h3 className="text-foreground mb-1 font-serif text-lg font-semibold">{t("dataset")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {sheets.length <= 1 ? t("nameYourDataset") : t("mapSheetsToDatasets")}
            </p>

            {sheets.length <= 1 ? (
              // Simplified single-sheet view
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dataset-name-0" className="text-foreground">
                    {t("datasetName")}
                  </Label>
                  <Input
                    id="dataset-name-0"
                    type="text"
                    value={sheetMappings[0]?.newDatasetName ?? ""}
                    onChange={handleSingleSheetNameChange}
                    placeholder={t("enterDatasetName")}
                    disabled={noCatalogSelected}
                  />
                  {sheets[0] && (
                    <p className="text-muted-foreground font-mono text-xs">
                      {t("rowsWillBeImported", { count: sheets[0].rowCount.toLocaleString() })}
                    </p>
                  )}
                </div>

                {/* Copy config from sibling dataset */}
                {siblingDatasets.length > 0 && sheetMappings[0]?.datasetId === "new" && (
                  <div className="space-y-2">
                    <Label htmlFor="copy-config-from" className="text-muted-foreground">
                      {t("copyConfigFrom")}
                    </Label>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value) {
                          const suggestion = configSuggestions.find((s) => s.datasetId === Number(value));
                          if (suggestion) {
                            setDatasetTarget(0, { similarityScore: suggestion.score / 100 });
                          }
                        }
                      }}
                      disabled={noCatalogSelected}
                    >
                      <SelectTrigger id="copy-config-from" className="h-11">
                        <SelectValue placeholder={t("noConfigToCopy")} />
                      </SelectTrigger>
                      <SelectContent>
                        {siblingDatasets.map((ds) => (
                          <SelectItem key={ds.id} value={String(ds.id)}>
                            {ds.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              // Multi-sheet view
              <div className="space-y-4">
                {sheets.map((sheet) => {
                  const mapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);
                  const datasets =
                    selectedCatalogId === "new" ? EMPTY_DATASETS : (selectedCatalog?.datasets ?? EMPTY_DATASETS);

                  return (
                    <div key={sheet.index} className="border-primary/10 bg-card/20 rounded-sm border p-4">
                      {/* Sheet info header */}
                      <div className="mb-3 flex items-center gap-3">
                        <FileSpreadsheetIcon className="text-muted-foreground h-4 w-4" />
                        <span className="text-foreground font-medium">{sheet.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {t("rowCount", { count: sheet.rowCount.toLocaleString() })}
                        </span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <DatasetSelect
                          sheetIndex={sheet.index}
                          value={mapping?.datasetId === "new" ? "new" : (mapping?.datasetId ?? "new")}
                          datasets={datasets}
                          disabled={noCatalogSelected}
                          onDatasetChange={handleDatasetChange}
                        />

                        {mapping?.datasetId === "new" && (
                          <DatasetNameInput
                            sheetIndex={sheet.index}
                            value={mapping.newDatasetName}
                            disabled={noCatalogSelected}
                            onNameChange={handleNewDatasetNameChange}
                          />
                        )}
                      </div>

                      {/* Schema similarity indicator */}
                      {mapping?.similarityScore !== null && mapping?.similarityScore !== undefined && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span className="bg-accent/10 text-accent rounded px-2 py-0.5 font-mono text-xs">
                            {t("percentMatch", { percent: Math.round(mapping.similarityScore * 100) })}
                          </span>
                          <span className="text-muted-foreground">{t("schemaSimilarity")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
