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

import { humanizeFileName } from "@/lib/ingest/humanize-file-name";
import type { UrlAuthConfig } from "@/lib/ingest/types/wizard";

import { AuthConfigFields } from "../auth-config-fields";
import { type ScheduleConfig, useWizardScheduleStepState } from "../wizard-store";

export interface StepScheduleProps {
  className?: string;
}

/** Default auth config used when the Schedule step form has no existing auth */
const DEFAULT_AUTH_CONFIG: UrlAuthConfig = {
  type: "none",
  apiKey: "",
  apiKeyHeader: "X-API-Key",
  bearerToken: "",
  username: "",
  password: "",
};

/**
 * Default schedule config used when enabling scheduling for the first time.
 *
 * `schemaMode: "flexible"` because scheduled imports are by-design periodic
 * re-fetches of (often-evolving) URLs. Additive (the manual-upload default)
 * pauses on any breaking change including reasonable schema drift; flexible
 * auto-approves non-breaking changes and only pauses on hard breaks. Manual
 * users still pick additive explicitly via the dropdown if they want it.
 */
const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  enabled: true,
  name: "",
  scheduleType: "frequency",
  frequency: "daily",
  cronExpression: "",
  schemaMode: "flexible",
};

export const StepSchedule = ({ className }: Readonly<StepScheduleProps>) => {
  const t = useTranslations("Ingest");
  const {
    sourceUrl,
    scheduleConfig,
    authConfig,
    file,
    editMode,
    nextStep,
    prevStep,
    setScheduleConfig,
    setAuthConfig,
  } = useWizardScheduleStepState();

  // In edit mode, schedule is always enabled
  const isScheduleEnabled = editMode || scheduleConfig?.enabled === true;

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

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-foreground font-serif text-3xl font-bold">{t("scheduleTitle")}</h2>
        <p className="text-muted-foreground mt-2">{t("scheduleDescription")}</p>
      </div>

      {/* Toggle card */}
      <Card className="overflow-hidden">
        <div className="border-primary/10 bg-card/30 flex items-center justify-between border-b px-6 py-5">
          <div className="flex items-center gap-3">
            {isScheduleEnabled ? (
              <RepeatIcon className="text-primary h-5 w-5" />
            ) : (
              <CalendarIcon className="text-primary h-5 w-5" />
            )}
            <div>
              <h3 className="text-foreground font-serif text-lg font-semibold">
                {isScheduleEnabled ? t("repeatOnSchedule") : t("importOnce")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {isScheduleEnabled ? t("repeatOnScheduleDescription") : t("importOnceDescription")}
              </p>
            </div>
          </div>
          {!editMode && (
            <Button
              type="button"
              variant={isScheduleEnabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleSchedule}
              aria-pressed={isScheduleEnabled}
              aria-label={isScheduleEnabled ? t("disableRecurringSchedule") : t("enableRecurringSchedule")}
            >
              {isScheduleEnabled ? t("scheduled") : t("oneTime")}
            </Button>
          )}
        </div>

        {/* Schedule configuration (shown when enabled) */}
        {isScheduleEnabled && (
          <CardContent className="space-y-6 p-6">
            {/* Source URL display */}
            {sourceUrl && (
              <div className="flex items-start gap-3">
                <GlobeIcon className="text-primary/40 mt-0.5 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">{t("sourceUrl")}</p>
                  <p className="text-foreground truncate font-mono text-sm">{sourceUrl}</p>
                </div>
              </div>
            )}

            {/* Schedule name */}
            <div className="space-y-2">
              <Label htmlFor="schedule-name">{t("scheduleName")}</Label>
              <Input
                id="schedule-name"
                placeholder={defaultScheduleName || t("scheduleNamePlaceholder")}
                value={activeConfig.name}
                onChange={handleNameChange}
              />
            </div>

            {/* Schedule type and frequency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="schedule-type">{t("scheduleType")}</Label>
                <Select value={activeConfig.scheduleType} onValueChange={handleScheduleTypeChange}>
                  <SelectTrigger id="schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frequency">{t("simpleFrequency")}</SelectItem>
                    <SelectItem value="cron">{t("cronExpression")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeConfig.scheduleType === "frequency" ? (
                <div className="space-y-2">
                  <Label htmlFor="frequency">{t("frequency")}</Label>
                  <Select value={activeConfig.frequency} onValueChange={handleFrequencyChange}>
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
                    value={activeConfig.cronExpression}
                    onChange={handleCronExpressionChange}
                  />
                </div>
              )}
            </div>

            {/* Schema mode */}
            <div className="space-y-2">
              <Label htmlFor="schema-mode">{t("schemaChangeHandling")}</Label>
              <Select value={activeConfig.schemaMode} onValueChange={handleSchemaModeChange}>
                <SelectTrigger id="schema-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">
                    <span className="font-medium">{t("schemaStrict")}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{t("schemaModeStrictLabel")}</span>
                  </SelectItem>
                  <SelectItem value="additive">
                    <span className="font-medium">{t("schemaAdditive")}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{t("schemaModeAdditiveLabel")}</span>
                  </SelectItem>
                  <SelectItem value="flexible">
                    <span className="font-medium">{t("schemaFlexible")}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{t("schemaModeFlexibleLabel")}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{t("schemaChangeHandlingHint")}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Authentication for scheduled ingests */}
      {isScheduleEnabled && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <KeyIcon className="text-muted-foreground h-4 w-4" />
              <span className="text-sm font-medium">{t("authSection")}</span>
            </div>
            <AuthConfigFields
              authConfig={authConfig ?? DEFAULT_AUTH_CONFIG}
              onAuthConfigChange={(config) => setAuthConfig(config)}
              compact
            />
            <p className="text-muted-foreground text-xs">{t("authPersistHint")}</p>
          </CardContent>
        </Card>
      )}

      {/* Sticky footer with Back + Continue to Review */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t border-transparent pt-4 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevStep} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              {isScheduleEnabled ? (
                <span className="flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {activeConfig.scheduleType === "frequency" ? t(activeConfig.frequency) : t("customCron")}
                </span>
              ) : (
                t("oneTimeImport")
              )}
            </span>
            <Button size="lg" onClick={nextStep} className="gap-2">
              {t("continueToReview")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
