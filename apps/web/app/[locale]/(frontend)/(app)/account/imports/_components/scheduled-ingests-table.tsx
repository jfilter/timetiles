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
  ErrorMessage,
  useConfirmDialog,
} from "@timetiles/ui";
import { ClockIcon, MoreHorizontalIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  getScheduleFrequencyKey,
  getScheduleStatusVariant,
} from "@/app/[locale]/(frontend)/(app)/account/_components/schedule-view-model";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRouter } from "@/i18n/navigation";
import { useErrorMessage } from "@/lib/hooks/use-error-message";
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
  readonly ownerId: number;
  readonly initialData: ScheduledIngest[];
}

const ActionsCell = ({ schedule }: { readonly schedule: ScheduledIngest }) => {
  const t = useTranslations("ImportActivity");
  const router = useRouter();
  const toggleMutation = useToggleScheduledIngestMutation();
  const deleteMutation = useDeleteScheduledIngestMutation();
  const triggerMutation = useTriggerScheduledIngestMutation();
  const formatError = useErrorMessage();
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const isPending = toggleMutation.isPending || deleteMutation.isPending || triggerMutation.isPending;

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
    requestConfirm({
      title: t("delete"),
      description: t("confirmDeleteSchedule"),
      confirmLabel: t("delete"),
      variant: "destructive",
      onConfirm: () => deleteMutation.mutate(schedule.id),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t("actions")} disabled={isPending}>
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
      {toggleMutation.error && <ErrorMessage message={formatError(toggleMutation.error)} />}
      {triggerMutation.error && <ErrorMessage message={formatError(triggerMutation.error)} />}
      {deleteMutation.error && <ErrorMessage message={formatError(deleteMutation.error)} />}
      {confirmDialog}
    </>
  );
};

export const ScheduledIngestsTable = ({ ownerId, initialData }: ScheduledIngestsTableProps) => {
  const t = useTranslations("ImportActivity");
  const formatError = useErrorMessage();
  const locale = useLocale();
  const { data: schedules = [], isLoading, error } = useScheduledIngestsQuery({ ownerId, data: initialData });

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
        cell: ({ row }) => {
          const variant = getScheduleStatusVariant(row.original);
          let label = t("statusActive");
          if (variant === "muted") label = t("statusDisabled");
          else if (variant === "error") label = t("statusFailed");
          else if (variant === "warning") label = t("statusAwaitingReview");
          return <StatusBadge variant={variant} label={label} />;
        },
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
        cell: ({ row }) => {
          const freq = getScheduleFrequencyKey(row.original);
          const label = freq.type === "cron" ? freq.value : t(freq.value as "hourly" | "daily" | "weekly" | "monthly");
          return <span className="text-muted-foreground text-sm">{label}</span>;
        },
      },
      {
        accessorKey: "lastRun",
        header: t("lastRun"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.lastRun, locale)}</span>
        ),
      },
      {
        accessorKey: "nextRun",
        header: t("nextRun"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.nextRun, locale)}</span>
        ),
      },
      {
        id: "actions",
        header: t("actions"),
        enableSorting: false,
        cell: ({ row }) => <ActionsCell schedule={row.original} />,
      },
    ],
    [locale, t]
  );

  if (error && schedules.length === 0) return <ErrorMessage message={formatError(error)} />;

  return (
    <>
      {error && <ErrorMessage message={formatError(error)} />}
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
    </>
  );
};
