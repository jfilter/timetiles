/**
 * Form sections of the import wizard's dataset selection step: the catalog
 * picker and the per-sheet dataset targets.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { FileSpreadsheetIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CatalogWithDatasets } from "@/lib/hooks/use-catalogs-query";
import type { ConfigSuggestion, SheetInfo, SheetMapping } from "@/lib/ingest/types/wizard";

import type { CatalogSelection } from "../wizard-state";

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

/** Catalog dropdown (when catalogs exist) and the name input for a new catalog. */
export const CatalogSection = ({
  catalogs,
  selectedCatalogId,
  newCatalogName,
  onCatalogChange,
  onNewCatalogNameChange,
}: {
  catalogs: CatalogWithDatasets[];
  selectedCatalogId: CatalogSelection;
  newCatalogName: string;
  onCatalogChange: (value: string) => void;
  onNewCatalogNameChange: (name: string) => void;
}) => {
  const t = useTranslations("Ingest");

  return (
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
              onValueChange={onCatalogChange}
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
              onChange={(e) => onNewCatalogNameChange(e.target.value)}
              placeholder={t("enterCatalogName")}
            />
          </div>
        )}
      </div>
    </div>
  );
};

/** Simplified dataset form for a single-sheet file, with "copy config from". */
export const SingleSheetDatasetForm = ({
  sheet,
  mapping,
  siblingDatasets,
  disabled,
  onNameChange,
  onCopyConfigFrom,
}: {
  sheet: SheetInfo | undefined;
  mapping: SheetMapping | undefined;
  siblingDatasets: Array<{ id: number; name: string }>;
  disabled: boolean;
  onNameChange: (sheetIndex: number, name: string) => void;
  onCopyConfigFrom: (datasetId: number) => void;
}) => {
  const t = useTranslations("Ingest");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dataset-name-0" className="text-foreground">
          {t("datasetName")}
        </Label>
        <Input
          id="dataset-name-0"
          type="text"
          value={mapping?.newDatasetName ?? ""}
          onChange={(e) => onNameChange(0, e.target.value)}
          placeholder={t("enterDatasetName")}
          disabled={disabled}
        />
        {sheet && (
          <p className="text-muted-foreground font-mono text-xs">
            {t("rowsWillBeImported", { count: sheet.rowCount })}
          </p>
        )}
      </div>

      {/* Copy config from sibling dataset */}
      {siblingDatasets.length > 0 && mapping?.datasetId === "new" && (
        <div className="space-y-2">
          <Label htmlFor="copy-config-from" className="text-muted-foreground">
            {t("copyConfigFrom")}
          </Label>
          <Select
            value=""
            onValueChange={(value) => {
              if (value) onCopyConfigFrom(Number(value));
            }}
            disabled={disabled}
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
  );
};

/** One sheet's target dataset in a multi-sheet file. */
export const SheetDatasetCard = ({
  sheet,
  mapping,
  datasets,
  disabled,
  onDatasetChange,
  onNameChange,
}: {
  sheet: SheetInfo;
  mapping: SheetMapping | undefined;
  datasets: Array<{ id: number; name: string }>;
  disabled: boolean;
  onDatasetChange: (sheetIndex: number, value: string) => void;
  onNameChange: (sheetIndex: number, name: string) => void;
}) => {
  const t = useTranslations("Ingest");

  return (
    <div className="border-primary/10 bg-card/20 rounded-sm border p-4">
      {/* Sheet info header */}
      <div className="mb-3 flex items-center gap-3">
        <FileSpreadsheetIcon className="text-muted-foreground h-4 w-4" />
        <span className="text-foreground font-medium">{sheet.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{t("rowCount", { count: sheet.rowCount })}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DatasetSelect
          sheetIndex={sheet.index}
          value={mapping?.datasetId ?? "new"}
          datasets={datasets}
          disabled={disabled}
          onDatasetChange={onDatasetChange}
        />

        {mapping?.datasetId === "new" && (
          <DatasetNameInput
            sheetIndex={sheet.index}
            value={mapping.newDatasetName}
            disabled={disabled}
            onNameChange={onNameChange}
          />
        )}
      </div>

      {/* Schema similarity indicator */}
      {mapping?.similarityScore != null && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="bg-accent/10 text-accent rounded px-2 py-0.5 font-mono text-xs">
            {t("percentMatch", { percent: Math.round(mapping.similarityScore * 100) })}
          </span>
          <span className="text-muted-foreground">{t("schemaSimilarity")}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Prompt to apply a server-detected dataset match, or the confirmation once
 * applied. Applying is an explicit click so a fuzzy server match never
 * silently changes wizard state; reset returns to the prompt.
 */
export const DatasetSuggestionBanner = ({
  suggestion,
  applied,
  dismissed,
  onApply,
  onIgnore,
  onReset,
}: {
  suggestion: ConfigSuggestion;
  applied: boolean;
  dismissed: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onReset: () => void;
}) => {
  const t = useTranslations("Ingest");

  if (applied) {
    return (
      <div
        className="border-accent/20 bg-accent/5 flex items-center justify-between rounded-sm border px-4 py-3"
        data-testid="dataset-suggestion-applied"
      >
        <span className="text-accent text-sm">{t("configLoadedFromDataset", { name: suggestion.datasetName })}</span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          {t("resetToAutoDetected")}
        </Button>
      </div>
    );
  }
  if (dismissed) return null;

  return (
    <div
      className="border-ring/20 bg-ring/5 flex items-center justify-between rounded-sm border px-4 py-3"
      data-testid="dataset-suggestion-banner"
    >
      <span className="text-ring text-sm">
        {t("similarConfig", { name: suggestion.datasetName, score: suggestion.score })}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onIgnore}>
          {t("ignoreSuggestion")}
        </Button>
        <Button size="sm" onClick={onApply}>
          {t("useThisConfig")}
        </Button>
      </div>
    </div>
  );
};
