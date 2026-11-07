/**
 * Summary cards of the import wizard's review step.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  ArrowDownIcon,
  CalendarIcon,
  DatabaseIcon,
  FingerprintIcon,
  FolderIcon,
  type LucideIcon,
  MapPinIcon,
  SparklesIcon,
  TextIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useTransformTypeLabels } from "@/lib/hooks/use-transform-type-labels";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping } from "@/lib/ingest/types/wizard";
import { formatFileSize } from "@/lib/utils/format";

import type { ScheduleConfig, WizardState } from "../wizard-state";
import { DEDUP_STRATEGY_CONFIG, ID_STRATEGY_CONFIG } from "./id-strategy-card";

export interface MappingWithDataset {
  mapping: FieldMapping;
  datasetName: string;
}

const ReviewRow = ({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Icon className="text-primary/40 h-4 w-4" />
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
    {children}
  </div>
);

const getLocationDisplay = (mapping: FieldMapping) => {
  if (mapping.locationField) return mapping.locationField;
  if (mapping.latitudeField && mapping.longitudeField) return `${mapping.latitudeField}, ${mapping.longitudeField}`;
  return null;
};

/** Source file → catalog and dataset(s). */
export const ReviewDataFlowCard = ({
  file,
  totalRows,
  catalogName,
  datasetNames,
}: {
  file: WizardState["file"];
  totalRows: number;
  catalogName: string;
  datasetNames: string[];
}) => {
  const t = useTranslations("Ingest");
  const isMultiDataset = datasetNames.length > 1;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Source file */}
        <div className="border-primary/10 border-b p-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary/5 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
              <DatabaseIcon className="text-primary h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate font-serif text-lg font-semibold">{file?.name}</p>
              <p className="text-muted-foreground mt-1 font-mono text-sm">
                {file ? formatFileSize(file.size) : "-"}
                <span className="text-primary/30 mx-2">•</span>
                {t("rowCount", { count: totalRows })}
              </p>
            </div>
          </div>
        </div>

        {/* Arrow connector */}
        <div className="bg-card/20 flex justify-center py-3">
          <ArrowDownIcon className="text-primary/30 h-5 w-5" />
        </div>

        {/* Destination */}
        <div className="divide-primary/10 grid grid-cols-2 divide-x">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-secondary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
                <FolderIcon className="text-secondary h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">{t("catalog")}</p>
                <p className="text-foreground truncate font-serif font-semibold">{catalogName}</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-ring/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
                <DatabaseIcon className="text-ring h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">
                  {isMultiDataset ? t("datasetsCount", { count: datasetNames.length }) : t("dataset")}
                </p>
                {isMultiDataset ? (
                  <div className="space-y-1">
                    {datasetNames.map((name) => (
                      <p key={name} className="text-foreground truncate font-serif text-sm font-medium">
                        {name}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-foreground truncate font-serif font-semibold">{datasetNames[0]}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/** Field mappings and record handling per dataset. */
export const ReviewMappingsCard = ({
  mappingsWithDataset,
  geocodingEnabled,
  deduplicationStrategy,
}: {
  mappingsWithDataset: MappingWithDataset[];
  geocodingEnabled: boolean;
  deduplicationStrategy: WizardState["deduplicationStrategy"];
}) => {
  const t = useTranslations("Ingest");
  const isMultiDataset = mappingsWithDataset.length > 1;
  const idStrategyLabels = Object.fromEntries(
    ID_STRATEGY_CONFIG.map((strategy) => [strategy.value, t(strategy.summaryLabelKey)])
  );
  const duplicateLabels = Object.fromEntries(
    DEDUP_STRATEGY_CONFIG.map((strategy) => [strategy.value, t(strategy.summaryLabelKey)])
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-primary/10 bg-card/30 border-b px-6 py-4">
        <h3 className="text-foreground font-serif text-lg font-semibold">{t("fieldMappings")}</h3>
      </div>
      <CardContent className="p-6">
        <div className="space-y-6">
          {mappingsWithDataset.map(({ mapping, datasetName }, idx) => {
            const locationDisplay = getLocationDisplay(mapping);
            return (
              <div key={mapping.sheetIndex} data-testid={`field-mapping-${mapping.sheetIndex}`}>
                {isMultiDataset && (
                  <p className="text-foreground mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                )}
                <div className="space-y-3">
                  <ReviewRow icon={TextIcon} label={t("fieldTitle")}>
                    <span className="text-foreground font-mono text-sm" data-testid="title-field">
                      {mapping.titleField ?? "—"}
                    </span>
                  </ReviewRow>
                  <ReviewRow icon={CalendarIcon} label={t("fieldDate")}>
                    <span className="text-foreground font-mono text-sm" data-testid="date-field">
                      {mapping.dateField ?? "—"}
                    </span>
                  </ReviewRow>
                  <ReviewRow icon={MapPinIcon} label={t("location")}>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-mono text-sm" data-testid="location-field">
                        {locationDisplay ?? "—"}
                      </span>
                      {geocodingEnabled && locationDisplay && (
                        <span className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs">
                          <SparklesIcon className="h-3 w-3" />
                          {t("geocode")}
                        </span>
                      )}
                    </div>
                  </ReviewRow>
                </div>
                {isMultiDataset && idx < mappingsWithDataset.length - 1 && (
                  <div className="border-primary/10 mt-4 border-t" />
                )}
              </div>
            );
          })}
        </div>

        {/* Record Handling */}
        <div className="border-primary/10 mt-6 border-t pt-6">
          <h4 className="text-foreground mb-4 font-serif text-base font-semibold">{t("recordHandling")}</h4>
          <div className="space-y-6">
            {mappingsWithDataset.map(({ mapping, datasetName }, idx) => (
              <div key={mapping.sheetIndex} data-testid={`record-handling-${mapping.sheetIndex}`}>
                {isMultiDataset && (
                  <p className="text-foreground mb-3 font-serif text-sm font-semibold">{datasetName}</p>
                )}
                <ReviewRow icon={FingerprintIcon} label={t("identifyBy")}>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-mono text-sm">{idStrategyLabels[mapping.idStrategy]}</span>
                    {mapping.idStrategy === "external" && mapping.idField && (
                      <span className="text-muted-foreground font-mono text-xs">({mapping.idField})</span>
                    )}
                  </div>
                </ReviewRow>
                {isMultiDataset && idx < mappingsWithDataset.length - 1 && (
                  <div className="border-primary/10 mt-4 border-t" />
                )}
              </div>
            ))}
            <div className="border-primary/10 border-t pt-4">
              <ReviewRow icon={DatabaseIcon} label={t("onDuplicate")}>
                <span className="text-foreground font-mono text-sm">{duplicateLabels[deduplicationStrategy]}</span>
              </ReviewRow>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/** All configured transforms across sheets; renders nothing when there are none. */
export const ReviewTransformsCard = ({ transforms }: { transforms: Record<number, IngestTransform[]> }) => {
  const t = useTranslations("Ingest");
  const typeLabels = useTransformTypeLabels();
  const allTransforms = Object.values(transforms).flat();
  if (allTransforms.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-primary/10 bg-card/30 border-b px-6 py-4">
        <h3 className="text-foreground font-serif text-lg font-semibold">{t("configuredTransforms")}</h3>
      </div>
      <CardContent className="p-6">
        <div className="space-y-2">
          {allTransforms.map((transform) => (
            <div key={transform.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium",
                  transform.active ? "bg-ring/10 text-ring" : "bg-muted text-muted-foreground"
                )}
              >
                {typeLabels[transform.type]}
              </span>
              <span className="text-muted-foreground font-mono text-sm">
                {"from" in transform ? transform.from : ""}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

/** Schedule summary for URL imports (configured in the schedule step). */
export const ReviewScheduleCard = ({ scheduleConfig }: { scheduleConfig: ScheduleConfig }) => {
  const t = useTranslations("Ingest");

  return (
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
  );
};
