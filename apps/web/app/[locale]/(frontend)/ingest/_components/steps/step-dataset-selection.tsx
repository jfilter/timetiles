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
import { useEffect, useMemo, useRef } from "react";

import { useCatalogsQuery } from "@/lib/hooks/use-catalogs-query";
import { humanizeFileName } from "@/lib/ingest/humanize-file-name";

import { useWizardCanProceed } from "../use-wizard-effects";
import { useWizardStore } from "../wizard-store";

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
          {datasets.map((dataset) => (
            <SelectItem key={dataset.id} value={String(dataset.id)}>
              {dataset.name}
            </SelectItem>
          ))}
          <SelectItem value="new">{t("createNewDataset")}</SelectItem>
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
  const sheets = useWizardStore((s) => s.sheets);
  const selectedCatalogId = useWizardStore((s) => s.selectedCatalogId);
  const newCatalogName = useWizardStore((s) => s.newCatalogName);
  const sheetMappings = useWizardStore((s) => s.sheetMappings);
  const configSuggestions = useWizardStore((s) => s.configSuggestions);
  const fileName = useWizardStore((s) => s.file?.name);
  const nextStep = useWizardStore((s) => s.nextStep);
  const setCatalog = useWizardStore((s) => s.setCatalog);
  const setSheetMapping = useWizardStore((s) => s.setSheetMapping);
  const canProceed = useWizardCanProceed();

  const { data: catalogsData, isLoading, error: queryError } = useCatalogsQuery();
  const catalogsList = catalogsData?.catalogs;
  const catalogs = catalogsList ?? [];
  const errorMessage = queryError instanceof Error ? queryError.message : t("failedToLoadCatalogs");
  const error = queryError ? errorMessage : null;

  // Derive a clean catalog name from the uploaded file name
  const suggestedCatalogName = fileName ? humanizeFileName(fileName) : "";

  // Auto-select from config suggestions when available, otherwise default to "new catalog"
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (isLoading || selectedCatalogId !== null || autoAppliedRef.current) return;

    // Try to auto-apply suggestions: match each sheet to its best suggestion
    const goodSuggestions = configSuggestions.filter((s) => s.score >= 60);
    if (goodSuggestions.length > 0 && catalogsList && catalogsList.length > 0) {
      const bestCatalogId = goodSuggestions[0]!.catalogId;
      if (catalogsList.some((c) => c.id === bestCatalogId)) {
        setCatalog(bestCatalogId);
        // Match each sheet to its best suggestion by name similarity
        for (let i = 0; i < sheetMappings.length; i++) {
          const sheetName = sheets[i]?.name?.toLowerCase() ?? "";
          const match = goodSuggestions.find(
            (s) => s.datasetName.toLowerCase().includes(sheetName) || sheetName.includes(s.datasetName.toLowerCase())
          );
          if (match) {
            setSheetMapping(i, { datasetId: match.datasetId });
          }
        }
        autoAppliedRef.current = true;
        return;
      }
    }

    // Fallback: auto-select "new catalog" if no catalogs exist
    if (!catalogsList || catalogsList.length === 0) {
      setCatalog("new", suggestedCatalogName);
    }
  }, [
    catalogsList,
    selectedCatalogId,
    isLoading,
    setCatalog,
    suggestedCatalogName,
    configSuggestions,
    sheetMappings.length,
    sheets,
    setSheetMapping,
  ]);

  const handleCatalogChange = (value: string) => {
    if (value === "new") {
      setCatalog("new");
    } else {
      setCatalog(value ? Number(value) : null);
    }
  };

  const handleNewCatalogNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCatalog("new", e.target.value);
  };

  const handleDatasetChange = (sheetIndex: number, value: string) => {
    setSheetMapping(sheetIndex, { datasetId: value === "new" ? "new" : Number(value) });
  };

  const handleNewDatasetNameChange = (sheetIndex: number, name: string) => {
    setSheetMapping(sheetIndex, { newDatasetName: name });
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

  // Show info when auto-applied from suggestions
  const wasAutoApplied = autoAppliedRef.current;

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
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("selectDestination")}</h2>
        <p className="text-muted-foreground mt-2">{t("selectDestinationDescription")}</p>
      </div>

      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      {/* Info banner when catalog + datasets were auto-selected from previous import */}
      {wasAutoApplied && (
        <div
          className="border-cartographic-forest/20 bg-cartographic-forest/5 flex items-center justify-between rounded-sm border px-4 py-3"
          data-testid="dataset-suggestion-applied"
        >
          <span className="text-cartographic-forest text-sm">
            {t("configLoadedFromDataset", { name: configSuggestions[0]?.datasetName ?? "" })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              autoAppliedRef.current = false;
              setCatalog(null);
            }}
          >
            {t("resetToAutoDetected")}
          </Button>
        </div>
      )}

      {/* Combined catalog + dataset card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Catalog section */}
          <div className="border-cartographic-terracotta/30 border-l-4 p-6">
            <h3 className="text-cartographic-charcoal mb-1 font-serif text-lg font-semibold">{t("catalog")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {catalogs.length === 0 ? t("createCatalogPrompt") : t("selectOrCreateCatalog")}
            </p>

            <div className="space-y-4">
              {/* Show dropdown only if user has existing catalogs */}
              {catalogs.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="catalog-select" className="text-cartographic-charcoal">
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
                      {catalogs.map((catalog) => (
                        <SelectItem key={catalog.id} value={String(catalog.id)}>
                          {catalog.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">{t("createNewCatalog")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(selectedCatalogId === "new" || catalogs.length === 0) && (
                <div className="space-y-2">
                  <Label htmlFor="new-catalog-name" className="text-cartographic-charcoal">
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
          <div className="border-cartographic-navy/10 border-t" />

          {/* Dataset section */}
          <div className={cn("p-6", noCatalogSelected && "opacity-50")}>
            <h3 className="text-cartographic-charcoal mb-1 font-serif text-lg font-semibold">{t("dataset")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {sheets.length <= 1 ? t("nameYourDataset") : t("mapSheetsToDatasets")}
            </p>

            {sheets.length <= 1 ? (
              // Simplified single-sheet view
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dataset-name-0" className="text-cartographic-charcoal">
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
                            setSheetMapping(0, { similarityScore: suggestion.score / 100 });
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
                    <div
                      key={sheet.index}
                      className="border-cartographic-navy/10 bg-cartographic-cream/20 rounded-sm border p-4"
                    >
                      {/* Sheet info header */}
                      <div className="mb-3 flex items-center gap-3">
                        <FileSpreadsheetIcon className="text-muted-foreground h-4 w-4" />
                        <span className="text-cartographic-charcoal font-medium">{sheet.name}</span>
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
                          <span className="bg-cartographic-forest/10 text-cartographic-forest rounded px-2 py-0.5 font-mono text-xs">
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
          <span className={cn("text-sm", canProceed ? "text-cartographic-forest" : "text-muted-foreground")}>
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
