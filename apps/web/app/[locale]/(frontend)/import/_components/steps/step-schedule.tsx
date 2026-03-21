/**
 * Schedule step for the import wizard (step 5, URL imports only).
 *
 * Allows users to choose between a one-time import or setting up a
 * recurring schedule. Shows auth configuration summary when present.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, Input, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowLeft, ArrowRight, CalendarIcon, ClockIcon, GlobeIcon, KeyIcon, RepeatIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { humanizeFileName } from "@/lib/import/humanize-file-name";

import { type ScheduleConfig, useWizardStore } from "../wizard-store";

export interface StepScheduleProps {
  className?: string;
}

/** Default schedule config used when enabling scheduling for the first time */
const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  enabled: true,
  name: "",
  scheduleType: "frequency",
  frequency: "daily",
  cronExpression: "",
  schemaMode: "additive",
};

export const StepSchedule = ({ className }: Readonly<StepScheduleProps>) => {
  const t = useTranslations("Import");
  const sourceUrl = useWizardStore((s) => s.sourceUrl);
  const scheduleConfig = useWizardStore((s) => s.scheduleConfig);
  const setScheduleConfig = useWizardStore((s) => s.setScheduleConfig);
  const authConfig = useWizardStore((s) => s.authConfig);
  const file = useWizardStore((s) => s.file);
  const nextStep = useWizardStore((s) => s.nextStep);
  const prevStep = useWizardStore((s) => s.prevStep);

  const isScheduleEnabled = scheduleConfig?.enabled === true;

  const defaultScheduleName = useMemo(
    () => (file?.name ? `${humanizeFileName(file.name)} - ${new Date().toLocaleDateString()}` : ""),
    [file?.name]
  );

  const activeConfig = useMemo(
    () => scheduleConfig ?? { ...DEFAULT_SCHEDULE_CONFIG, name: defaultScheduleName },
    [scheduleConfig, defaultScheduleName]
  );

  // --- Handlers ---

  const handleToggleSchedule = useCallback(() => {
    if (isScheduleEnabled) {
      setScheduleConfig(null);
    } else {
      setScheduleConfig({ ...DEFAULT_SCHEDULE_CONFIG, name: defaultScheduleName });
    }
  }, [isScheduleEnabled, setScheduleConfig, defaultScheduleName]);

  const updateField = useCallback(
    (updates: Partial<ScheduleConfig>) => {
      setScheduleConfig({ ...activeConfig, ...updates });
    },
    [activeConfig, setScheduleConfig]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField({ name: e.target.value });
    },
    [updateField]
  );

  const handleScheduleTypeChange = useCallback(
    (value: string) => {
      updateField({ scheduleType: value as "frequency" | "cron" });
    },
    [updateField]
  );

  const handleFrequencyChange = useCallback(
    (value: string) => {
      updateField({ frequency: value as "hourly" | "daily" | "weekly" | "monthly" });
    },
    [updateField]
  );

  const handleCronExpressionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField({ cronExpression: e.target.value });
    },
    [updateField]
  );

  const handleSchemaModeChange = useCallback(
    (value: string) => {
      updateField({ schemaMode: value as "strict" | "additive" | "flexible" });
    },
    [updateField]
  );

  // --- Auth summary label ---

  const authSummaryLabel = useMemo(() => {
    if (!authConfig || authConfig.type === "none") return null;
    switch (authConfig.type) {
      case "bearer":
        // TODO: i18n — "Authentication: Bearer Token configured"
        return "Authentication: Bearer Token configured";
      case "api-key":
        // TODO: i18n — "Authentication: API Key configured"
        return `Authentication: API Key configured (${authConfig.apiKeyHeader ?? "X-API-Key"})`;
      case "basic":
        // TODO: i18n — "Authentication: Basic Auth configured"
        return "Authentication: Basic Auth configured";
      default:
        return null;
    }
  }, [authConfig]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="text-center">
        {/* TODO: i18n — "Schedule Import" */}
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Schedule Import</h2>
        {/* TODO: i18n — "Choose whether to import once or set up recurring imports" */}
        <p className="text-cartographic-navy/70 mt-2">Choose whether to import once or set up recurring imports</p>
      </div>

      {/* Toggle card */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 flex items-center justify-between border-b px-6 py-5">
          <div className="flex items-center gap-3">
            {isScheduleEnabled ? (
              <RepeatIcon className="text-cartographic-navy h-5 w-5" />
            ) : (
              <CalendarIcon className="text-cartographic-navy h-5 w-5" />
            )}
            <div>
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">
                {/* TODO: i18n */}
                {isScheduleEnabled ? "Repeat on schedule" : "Import once"}
              </h3>
              <p className="text-cartographic-navy/60 text-sm">
                {/* TODO: i18n */}
                {isScheduleEnabled
                  ? "Data will be re-imported automatically on the schedule below"
                  : "Data will be imported once from the URL"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant={isScheduleEnabled ? "default" : "outline"}
            size="sm"
            onClick={handleToggleSchedule}
            aria-pressed={isScheduleEnabled}
            aria-label={
              isScheduleEnabled
                ? "Disable recurring schedule" /* TODO: i18n */
                : "Enable recurring schedule" /* TODO: i18n */
            }
          >
            {/* TODO: i18n */}
            {isScheduleEnabled ? "Scheduled" : "One-time"}
          </Button>
        </div>

        {/* Schedule configuration (shown when enabled) */}
        {isScheduleEnabled && (
          <CardContent className="space-y-6 p-6">
            {/* Source URL display */}
            {sourceUrl && (
              <div className="flex items-start gap-3">
                <GlobeIcon className="text-cartographic-navy/40 mt-0.5 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  {/* TODO: i18n — "Source URL" */}
                  <p className="text-cartographic-navy/70 text-xs">Source URL</p>
                  <p className="text-cartographic-charcoal truncate font-mono text-sm">{sourceUrl}</p>
                </div>
              </div>
            )}

            {/* Schedule name */}
            <div className="space-y-2">
              {/* TODO: i18n — "Schedule name" */}
              <Label htmlFor="schedule-name">Schedule name</Label>
              <Input
                id="schedule-name"
                placeholder={defaultScheduleName || "My scheduled import" /* TODO: i18n */}
                value={activeConfig.name}
                onChange={handleNameChange}
              />
            </div>

            {/* Schedule type and frequency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {/* TODO: i18n — "Schedule type" */}
                <Label htmlFor="schedule-type">Schedule type</Label>
                <Select value={activeConfig.scheduleType} onValueChange={handleScheduleTypeChange}>
                  <SelectTrigger id="schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* TODO: i18n */}
                    <SelectItem value="frequency">Frequency</SelectItem>
                    <SelectItem value="cron">Cron expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeConfig.scheduleType === "frequency" ? (
                <div className="space-y-2">
                  {/* TODO: i18n — "Frequency" */}
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select value={activeConfig.frequency} onValueChange={handleFrequencyChange}>
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* TODO: i18n */}
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* TODO: i18n — "Cron expression" */}
                  <Label htmlFor="cron-expression">Cron expression</Label>
                  <Input
                    id="cron-expression"
                    placeholder="0 0 * * *"
                    value={activeConfig.cronExpression}
                    onChange={handleCronExpressionChange}
                  />
                </div>
              )}
            </div>

            {/* Schema mode */}
            <div className="space-y-2">
              {/* TODO: i18n — "Schema change handling" */}
              <Label htmlFor="schema-mode">Schema change handling</Label>
              <Select value={activeConfig.schemaMode} onValueChange={handleSchemaModeChange}>
                <SelectTrigger id="schema-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* TODO: i18n */}
                  <SelectItem value="strict">
                    <span className="font-medium">Strict</span>
                    <span className="text-muted-foreground ml-2 text-xs">Fail if schema changes</span>
                  </SelectItem>
                  <SelectItem value="additive">
                    <span className="font-medium">Additive</span>
                    <span className="text-muted-foreground ml-2 text-xs">Allow new columns</span>
                  </SelectItem>
                  <SelectItem value="flexible">
                    <span className="font-medium">Flexible</span>
                    <span className="text-muted-foreground ml-2 text-xs">Accept any changes</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* TODO: i18n — "How to handle..." */}
              <p className="text-muted-foreground text-xs">
                How to handle changes in the source data structure between imports
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Auth summary card */}
      {authSummaryLabel && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4">
            <KeyIcon className="text-cartographic-navy/60 h-4 w-4" />
            <span className="text-cartographic-charcoal text-sm">{authSummaryLabel}</span>
          </div>
        </Card>
      )}

      {/* Sticky footer with Back + Continue to Review */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevStep} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {/* TODO: i18n — "Back" */}
            {t("back")}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-cartographic-navy/50 text-sm">
              {/* TODO: i18n */}
              {isScheduleEnabled ? (
                <span className="flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {activeConfig.scheduleType === "frequency" ? activeConfig.frequency : "Custom cron"}
                </span>
              ) : (
                "One-time import"
              )}
            </span>
            <Button size="lg" onClick={nextStep} className="gap-2">
              {/* TODO: i18n — "Continue to Review" */}
              Continue to Review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
