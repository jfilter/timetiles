/**
 * JSON API configuration panel for the import wizard upload step.
 *
 * Displays records path input, reload button, and pagination settings
 * when a URL returns a JSON response that was auto-converted to CSV.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
} from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { ChevronDownIcon, GlobeIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { JsonApiConfig } from "../wizard-store";

interface ConfigChangeHandler {
  config: JsonApiConfig;
  onConfigChange: (config: JsonApiConfig | null) => void;
}

/** Pagination detail fields shown when pagination is enabled */
const PaginationFields = ({ config, onConfigChange }: Readonly<ConfigChangeHandler>) => {
  const t = useTranslations("Import");

  return (
    <div className="grid gap-3 pl-6 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">{t("paginationType")}</Label>
        <Select
          value={config.pagination?.type ?? "page"}
          onValueChange={(v) =>
            onConfigChange({
              ...config,
              pagination: { ...config.pagination!, type: v as "offset" | "cursor" | "page" },
            })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">{t("pageNumber")}</SelectItem>
            <SelectItem value="offset">{t("offsetLimit")}</SelectItem>
            <SelectItem value="cursor">{t("cursorBased")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("recordsPerPage")}</Label>
        <Input
          type="number"
          min={1}
          max={10000}
          value={config.pagination?.limitValue ?? 100}
          onChange={(e) =>
            onConfigChange({
              ...config,
              pagination: { ...config.pagination!, limitValue: Number(e.target.value) || 100 },
            })
          }
          className="h-8 text-xs"
        />
      </div>
      {config.pagination?.type === "cursor" && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{t("nextCursorPath")}</Label>
          <Input
            placeholder="meta.next_cursor"
            value={config.pagination.nextCursorPath ?? ""}
            onChange={(e) =>
              onConfigChange({
                ...config,
                pagination: { ...config.pagination!, nextCursorPath: e.target.value || undefined },
              })
            }
            className="h-8 font-mono text-xs"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("maxPages")}</Label>
        <Input
          type="number"
          min={1}
          max={500}
          value={config.pagination?.maxPages ?? 50}
          onChange={(e) =>
            onConfigChange({ ...config, pagination: { ...config.pagination!, maxPages: Number(e.target.value) || 50 } })
          }
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
};

export interface JsonApiConfigPanelProps {
  jsonApiConfig: JsonApiConfig | null;
  onConfigChange: (config: JsonApiConfig | null) => void;
  onReload: () => void;
  isReloading: boolean;
}

export const JsonApiConfigPanel = ({
  jsonApiConfig,
  onConfigChange,
  onReload,
  isReloading,
}: Readonly<JsonApiConfigPanelProps>) => {
  const t = useTranslations("Import");

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <GlobeIcon className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">{t("jsonApiDetected")}</span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="records-path" className="text-sm">
              {t("recordsPath")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="records-path"
                placeholder="data.results"
                value={jsonApiConfig?.recordsPath ?? ""}
                onChange={(e) =>
                  onConfigChange({ ...jsonApiConfig, recordsPath: e.target.value || undefined, wasAutoDetected: false })
                }
                className="flex-1 font-mono text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={onReload} disabled={isReloading}>
                {isReloading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : t("reload")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("recordsPathDescription")}</p>
          </div>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-blue-800 hover:text-blue-900">
              {t("paginationSettings")}
              <ChevronDownIcon className="h-3 w-3" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pagination-enabled"
                  checked={jsonApiConfig?.pagination?.enabled ?? false}
                  onChange={(e) =>
                    onConfigChange({
                      ...jsonApiConfig,
                      pagination: {
                        ...jsonApiConfig?.pagination,
                        enabled: e.target.checked,
                        type: jsonApiConfig?.pagination?.type ?? "page",
                      },
                    })
                  }
                  className="rounded"
                />
                <Label htmlFor="pagination-enabled" className="text-sm">
                  {t("fetchMultiplePages")}
                </Label>
              </div>
              {jsonApiConfig?.pagination?.enabled && (
                <PaginationFields config={jsonApiConfig} onConfigChange={onConfigChange} />
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
};
