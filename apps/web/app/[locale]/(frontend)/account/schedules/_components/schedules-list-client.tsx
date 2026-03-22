/**
 * Client component for listing and managing scheduled ingests.
 *
 * Displays schedules in a card list with status indicators and actions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  GlobeIcon,
  Loader2Icon,
  PauseCircleIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyResourceCard } from "@/app/[locale]/(frontend)/account/_components/empty-resource-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRouter } from "@/i18n/navigation";
import { useLoadingStates } from "@/lib/hooks/use-loading-states";
import {
  useDeleteScheduledIngestMutation,
  useToggleScheduledIngestMutation,
  useTriggerScheduledIngestMutation,
} from "@/lib/hooks/use-scheduled-ingest-mutations";
import { useScheduledIngestsQuery } from "@/lib/hooks/use-scheduled-ingests-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

// Helper to get toggle button icon based on loading state
const getToggleButtonIcon = (loadingState: string | undefined, enabled: boolean) => {
  if (loadingState === "toggling") {
    return <Loader2Icon className="h-4 w-4 animate-spin" />;
  }
  if (enabled) {
    return <PauseCircleIcon className="h-4 w-4" />;
  }
  return <PlayIcon className="h-4 w-4" />;
};

interface SchedulesListClientProps {
  initialSchedules: ScheduledIngest[];
}

type TranslateFn = ReturnType<typeof useTranslations<"Schedules">>;

const FREQUENCY_KEYS = { hourly: "hourly", daily: "daily", weekly: "weekly", monthly: "monthly" } as const;

const SCHEMA_MODE_KEYS = { strict: "strict", additive: "additive", flexible: "flexible" } as const;

// Get status badge
const getStatusBadge = (schedule: ScheduledIngest, t: TranslateFn) => {
  if (!schedule.enabled) {
    return <StatusBadge variant="muted" label={t("disabled")} icon={<PauseCircleIcon className="h-3 w-3" />} />;
  }
  if (schedule.lastStatus === "failed") {
    return <StatusBadge variant="error" label={t("failed")} icon={<XCircleIcon className="h-3 w-3" />} />;
  }
  return <StatusBadge variant="success" label={t("active")} icon={<CheckCircle2Icon className="h-3 w-3" />} />;
};

interface ScheduleCardProps {
  schedule: ScheduledIngest;
  loadingState?: string;
  onToggle: () => void;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
  t: TranslateFn;
}

const ScheduleCard = ({ schedule, loadingState, onToggle, onEdit, onRun, onDelete, t }: ScheduleCardProps) => {
  const isLoading = Boolean(loadingState);

  const frequencyKey = FREQUENCY_KEYS[schedule.frequency ?? "daily"];
  const frequencyLabel = frequencyKey ? t(frequencyKey) : schedule.frequency;
  const schemaModeKey = schedule.schemaMode ? SCHEMA_MODE_KEYS[schedule.schemaMode] : null;

  return (
    <Card className={cn("transition-opacity", !schedule.enabled && "opacity-60", isLoading && "pointer-events-none")}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Main info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-semibold">{schedule.name}</h3>
              {getStatusBadge(schedule, t)}
            </div>

            {/* URL */}
            <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <GlobeIcon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate font-mono text-xs">{schedule.sourceUrl}</span>
            </div>

            {/* Schedule info */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="text-muted-foreground h-4 w-4" />
                <span>{schedule.scheduleType === "frequency" ? frequencyLabel : schedule.cronExpression}</span>
              </div>

              {schemaModeKey && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <span>{t("schema")}</span>
                  <span className="font-medium">{t(schemaModeKey)}</span>
                </div>
              )}
            </div>

            {/* Execution info */}
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-xs">
              {schedule.lastRun && <span>{t("lastRun", { date: formatDateLocale(schedule.lastRun) })}</span>}
              {schedule.nextRun && schedule.enabled && (
                <span>{t("nextRun", { date: formatDateLocale(schedule.nextRun) })}</span>
              )}
              {schedule.lastError && (
                <span className="text-destructive truncate" title={schedule.lastError}>
                  {schedule.lastError.substring(0, 50)}...
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggle}
              disabled={isLoading}
              title={schedule.enabled ? t("disableSchedule") : t("enableSchedule")}
            >
              {getToggleButtonIcon(loadingState, schedule.enabled ?? false)}
            </Button>

            <Button variant="outline" size="sm" onClick={onEdit} disabled={isLoading} title={t("editSchedule")}>
              <PencilIcon className="h-4 w-4" />
            </Button>

            <Button variant="outline" size="sm" onClick={onRun} disabled={isLoading} title={t("runNow")}>
              {loadingState === "running" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isLoading}
              title={t("deleteSchedule")}
              className="text-destructive hover:bg-destructive/10"
            >
              {loadingState === "deleting" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SchedulesListClient = ({ initialSchedules }: SchedulesListClientProps) => {
  const t = useTranslations("Schedules");
  const tImport = useTranslations("Ingest");
  const router = useRouter();
  const { data: schedules = [] } = useScheduledIngestsQuery(initialSchedules);
  const { states: loadingStates, setLoading, clearLoading } = useLoadingStates();

  const toggleMutation = useToggleScheduledIngestMutation();
  const deleteMutation = useDeleteScheduledIngestMutation();
  const triggerMutation = useTriggerScheduledIngestMutation();

  const handleToggleEnabled = (id: number, currentEnabled: boolean) => {
    setLoading(id, "toggling");
    toggleMutation.mutate({ id, enabled: !currentEnabled }, { onSettled: () => clearLoading(id) });
  };

  const handleEdit = (id: number) => {
    router.push(`/ingest?edit=${id}`);
  };

  const handleManualRun = (id: number) => {
    setLoading(id, "running");
    triggerMutation.mutate(id, { onSettled: () => clearLoading(id) });
  };

  const handleDelete = (id: number) => {
    if (!confirm(t("confirmDelete"))) return;
    setLoading(id, "deleting");
    deleteMutation.mutate(id, { onSettled: () => clearLoading(id) });
  };

  const scheduleCallbacks = Object.fromEntries(
    schedules.map((s) => [
      s.id,
      {
        onToggle: () => handleToggleEnabled(s.id, s.enabled ?? false),
        onEdit: () => handleEdit(s.id),
        onRun: () => handleManualRun(s.id),
        onDelete: () => handleDelete(s.id),
      },
    ])
  ) as Record<number, { onToggle: () => void; onEdit: () => void; onRun: () => void; onDelete: () => void }>;

  if (schedules.length === 0) {
    return (
      <EmptyResourceCard
        icon={<ClockIcon className="text-muted-foreground mb-4 h-12 w-12" />}
        title={t("noSchedules")}
        description={t("noSchedulesDescription")}
        action={{ label: tImport("importData"), href: "/import" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {schedules.map((schedule) => {
        const callbacks = scheduleCallbacks[schedule.id];
        if (!callbacks) return null;
        return (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            loadingState={loadingStates[schedule.id]}
            onToggle={callbacks.onToggle}
            onEdit={callbacks.onEdit}
            onRun={callbacks.onRun}
            onDelete={callbacks.onDelete}
            t={t}
          />
        );
      })}
    </div>
  );
};
