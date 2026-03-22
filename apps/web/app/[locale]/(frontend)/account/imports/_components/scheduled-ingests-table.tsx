/**
 * Table component for displaying scheduled ingest records.
 *
 * Shows name, status, source URL, frequency, last/next run, and
 * action menu in a sortable, paginated DataTable.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  type ColumnDef,
  ContentState,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@timetiles/ui";
import { ClockIcon, MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useRouter } from "@/i18n/navigation";
import {
  useDeleteScheduledIngestMutation,
  useToggleScheduledIngestMutation,
  useTriggerScheduledIngestMutation,
} from "@/lib/hooks/use-scheduled-ingest-mutations";
import { useScheduledIngestsQuery } from "@/lib/hooks/use-scheduled-ingests-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

import { ScheduleRunHistory } from "./schedule-run-history";

interface ScheduledIngestsTableProps {
  readonly initialData: ScheduledIngest[];
}

const getStatusVariant = (schedule: ScheduledIngest): StatusVariant => {
  if (!schedule.enabled) return "muted";
  if (schedule.lastStatus === "failed") return "error";
  return "success";
};

const ActionsCell = ({ schedule }: { readonly schedule: ScheduledIngest }) => {
  const t = useTranslations("ImportActivity");
  const router = useRouter();
  const toggleMutation = useToggleScheduledIngestMutation();
  const deleteMutation = useDeleteScheduledIngestMutation();
  const triggerMutation = useTriggerScheduledIngestMutation();

  const handleToggle = () => {
    toggleMutation.mutate({ id: schedule.id, enabled: !schedule.enabled });
  };

  const handleEdit = () => {
    router.push(`/ingest?edit=${schedule.id}`);
  };

  const handleRunNow = () => {
    triggerMutation.mutate(schedule.id);
  };

  const handleDelete = () => {
    if (!confirm(t("confirmDeleteSchedule"))) return;
    deleteMutation.mutate(schedule.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("actions")}>
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleToggle}>{schedule.enabled ? t("disable") : t("enable")}</DropdownMenuItem>
        <DropdownMenuItem onClick={handleEdit}>{t("edit")}</DropdownMenuItem>
        <DropdownMenuItem onClick={handleRunNow}>{t("runNow")}</DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const FREQUENCY_KEY_MAP = { hourly: "hourly", daily: "daily", weekly: "weekly", monthly: "monthly" } as const;

export const ScheduledIngestsTable = ({ initialData }: ScheduledIngestsTableProps) => {
  const t = useTranslations("ImportActivity");
  const { data: schedules = [], isLoading } = useScheduledIngestsQuery(initialData);

  const getStatusLabel = useCallback(
    (schedule: ScheduledIngest): string => {
      if (!schedule.enabled) return t("statusDisabled");
      if (schedule.lastStatus === "failed") return t("statusFailed");
      return t("statusActive");
    },
    [t]
  );

  const getFrequencyDisplay = useCallback(
    (schedule: ScheduledIngest): string => {
      if (schedule.scheduleType === "cron" && schedule.cronExpression) {
        return schedule.cronExpression;
      }
      const freq = schedule.frequency ?? "daily";
      const key = FREQUENCY_KEY_MAP[freq];
      return key ? t(key) : freq;
    },
    [t]
  );

  const columns = useMemo<ColumnDef<ScheduledIngest, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("name"),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "enabled",
        header: t("status"),
        cell: ({ row }) => (
          <StatusBadge variant={getStatusVariant(row.original)} label={getStatusLabel(row.original)} />
        ),
      },
      {
        accessorKey: "sourceUrl",
        header: t("sourceUrl"),
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate font-mono text-xs" title={row.original.sourceUrl}>
            {row.original.sourceUrl}
          </span>
        ),
      },
      {
        accessorKey: "frequency",
        header: t("frequency"),
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{getFrequencyDisplay(row.original)}</span>,
      },
      {
        accessorKey: "lastRun",
        header: t("lastRun"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.lastRun)}</span>
        ),
      },
      {
        accessorKey: "nextRun",
        header: t("nextRun"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.nextRun)}</span>
        ),
      },
      {
        id: "actions",
        header: t("actions"),
        enableSorting: false,
        cell: ({ row }) => <ActionsCell schedule={row.original} />,
      },
    ],
    [t, getStatusLabel, getFrequencyDisplay]
  );

  return (
    <DataTable
      columns={columns}
      data={schedules}
      isLoading={isLoading}
      emptyState={
        <ContentState
          variant="empty"
          icon={<ClockIcon className="h-12 w-12" />}
          title={t("noSchedules")}
          subtitle={t("noSchedulesDescription")}
        />
      }
      getRowId={(row) => String(row.id)}
      renderExpandedRow={(row) => <ScheduleRunHistory scheduleId={row.id} executionHistory={row.executionHistory} />}
    />
  );
};
