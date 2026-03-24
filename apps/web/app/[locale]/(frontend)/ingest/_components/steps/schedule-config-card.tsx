/**
 * Schedule configuration card for the import review step.
 *
 * Allows users to configure automatic re-import scheduling
 * when importing from a URL source.
 *
 * @module
 * @category Components
 */

"use client";

import { Button, Card, CardContent, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { ClockIcon, GlobeIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ScheduleConfig } from "../wizard-store";

export interface ScheduleConfigCardProps {
  sourceUrl: string;
  activeScheduleConfig: ScheduleConfig;
  onToggleEnabled: () => void;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onScheduleTypeChange: (value: string) => void;
  onFrequencyChange: (value: string) => void;
  onCronExpressionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSchemaModeChange: (value: string) => void;
}

export const ScheduleConfigCard = ({
  sourceUrl,
  activeScheduleConfig,
  onToggleEnabled,
  onNameChange,
  onScheduleTypeChange,
  onFrequencyChange,
  onCronExpressionChange,
  onSchemaModeChange,
}: Readonly<ScheduleConfigCardProps>) => {
  const t = useTranslations("Ingest");

  return (
    <Card className="overflow-hidden">
      <div className="border-primary/10 bg-card/30 flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <ClockIcon className="text-primary h-5 w-5" />
          <h3 className="text-foreground font-serif text-lg font-semibold">{t("scheduledIngest")}</h3>
        </div>
        <Button
          type="button"
          variant={activeScheduleConfig.enabled ? "default" : "outline"}
          size="sm"
          onClick={onToggleEnabled}
          aria-label={t("enableScheduledImport")}
        >
          {activeScheduleConfig.enabled ? t("enabled") : t("disabled")}
        </Button>
      </div>
      {activeScheduleConfig.enabled && (
        <CardContent className="space-y-6 p-6">
          {/* Source URL display */}
          <div className="flex items-start gap-3">
            <GlobeIcon className="text-primary/40 mt-0.5 h-4 w-4" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">{t("sourceUrl")}</p>
              <p className="text-foreground truncate font-mono text-sm">{sourceUrl}</p>
            </div>
          </div>

          {/* Schedule name */}
          <div className="space-y-2">
            <Label htmlFor="schedule-name">{t("scheduleName")}</Label>
            <Input
              id="schedule-name"
              placeholder={t("scheduleNamePlaceholder")}
              value={activeScheduleConfig.name}
              onChange={onNameChange}
            />
          </div>

          {/* Schedule type and frequency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schedule-type">{t("scheduleType")}</Label>
              <Select value={activeScheduleConfig.scheduleType} onValueChange={onScheduleTypeChange}>
                <SelectTrigger id="schedule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frequency">{t("simpleFrequency")}</SelectItem>
                  <SelectItem value="cron">{t("cronExpression")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeScheduleConfig.scheduleType === "frequency" ? (
              <div className="space-y-2">
                <Label htmlFor="frequency">{t("frequency")}</Label>
                <Select value={activeScheduleConfig.frequency} onValueChange={onFrequencyChange}>
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">{t("hourly")}</SelectItem>
                    <SelectItem value="daily">{t("daily")}</SelectItem>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cron-expression">{t("cronExpressionLabel")}</Label>
                <Input
                  id="cron-expression"
                  placeholder="0 0 * * *"
                  value={activeScheduleConfig.cronExpression}
                  onChange={onCronExpressionChange}
                />
              </div>
            )}
          </div>

          {/* Schema mode */}
          <div className="space-y-2">
            <Label htmlFor="schema-mode">{t("schemaChangeHandling")}</Label>
            <Select value={activeScheduleConfig.schemaMode} onValueChange={onSchemaModeChange}>
              <SelectTrigger id="schema-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">
                  <span className="font-medium">{t("schemaStrict")}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{t("schemaStrictDescription")}</span>
                </SelectItem>
                <SelectItem value="additive">
                  <span className="font-medium">{t("schemaAdditive")}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{t("schemaAdditiveDescription")}</span>
                </SelectItem>
                <SelectItem value="flexible">
                  <span className="font-medium">{t("schemaFlexible")}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{t("schemaFlexibleDescription")}</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{t("schemaChangeHandlingDescription")}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
