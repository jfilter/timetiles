/**
 * Table component for displaying scrapers flattened from their repositories.
 *
 * Each row represents a single scraper with a column showing its parent
 * repository name, status badge, runtime, schedule, last run, and actions.
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
  useConfirmDialog,
} from "@timetiles/ui";
import { CodeIcon, MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  buildRepoMap,
  flattenScraperRows,
  getScraperStatusVariant,
  type ScraperRow,
} from "@/app/[locale]/(frontend)/account/_components/scraper-view-model";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  useDeleteScraperRepoMutation,
  useRunScraperMutation,
  useSyncScraperRepoMutation,
} from "@/lib/hooks/use-scraper-mutations";
import { useScraperReposQuery, useScrapersQuery } from "@/lib/hooks/use-scrapers-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { Scraper, ScraperRepo } from "@/payload-types";

import { ScraperRunHistory } from "./scraper-run-history";

interface ScrapersTableProps {
  readonly initialRepos: ScraperRepo[];
  readonly initialScrapers: Scraper[];
}

const ActionsCell = ({ row }: { readonly row: ScraperRow }) => {
  const t = useTranslations("ImportActivity");
  const runMutation = useRunScraperMutation();
  const syncMutation = useSyncScraperRepoMutation();
  const deleteMutation = useDeleteScraperRepoMutation();
  const { requestConfirm, confirmDialog } = useConfirmDialog();

  const handleRun = () => {
    runMutation.mutate(row.scraper.id);
  };

  const handleSync = () => {
    syncMutation.mutate(row.repoId);
  };

  const handleDelete = () => {
    requestConfirm({
      title: t("deleteRepo"),
      description: t("confirmDeleteRepo"),
      confirmLabel: t("deleteRepo"),
      variant: "destructive",
      onConfirm: () => deleteMutation.mutate(row.repoId),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t("actions")}>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRun}>{t("runScraper")}</DropdownMenuItem>
          <DropdownMenuItem onClick={handleSync}>{t("syncRepo")}</DropdownMenuItem>
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            {t("deleteRepo")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
    </>
  );
};

export const ScrapersTable = ({ initialRepos, initialScrapers }: ScrapersTableProps) => {
  const t = useTranslations("ImportActivity");
  const { data: repos = [] } = useScraperReposQuery(initialRepos);
  const { data: allScrapers = [] } = useScrapersQuery(undefined, initialScrapers);

  const repoMap = useMemo(() => buildRepoMap(repos), [repos]);
  const rows = useMemo(() => flattenScraperRows(allScrapers, repoMap), [allScrapers, repoMap]);

  const columns = useMemo<ColumnDef<ScraperRow, unknown>[]>(
    () => [
      {
        accessorFn: (row) => row.scraper.name,
        id: "name",
        header: t("name"),
        cell: ({ row }) => <span className="font-medium">{row.original.scraper.name}</span>,
      },
      {
        accessorKey: "repoName",
        header: t("repository"),
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.repoName}</span>,
      },
      {
        accessorFn: (row) => row.scraper.lastRunStatus,
        id: "status",
        header: t("status"),
        cell: ({ row }) => {
          const status = row.original.scraper.lastRunStatus;
          const variant = getScraperStatusVariant(status);
          const labelMap = {
            info: t("statusRunning"),
            success: t("statusSuccess"),
            warning: t("statusTimeout"),
            error: t("statusFailed"),
            muted: t("statusNeverRun"),
          } as const;
          return <StatusBadge variant={variant} label={labelMap[variant] ?? t("statusNeverRun")} />;
        },
      },
      {
        accessorFn: (row) => row.scraper.runtime,
        id: "runtime",
        header: t("runtime"),
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.scraper.runtime}</span>,
      },
      {
        accessorFn: (row) => row.scraper.schedule,
        id: "schedule",
        header: t("schedule"),
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.scraper.schedule ?? t("manualOnly")}
          </span>
        ),
      },
      {
        accessorFn: (row) => row.scraper.lastRunAt,
        id: "lastRun",
        header: t("lastRun"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.scraper.lastRunAt)}</span>
        ),
      },
      {
        id: "actions",
        header: t("actions"),
        enableSorting: false,
        cell: ({ row }) => <ActionsCell row={row.original} />,
      },
    ],
    [t]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={false}
      emptyState={
        <ContentState
          variant="empty"
          icon={<CodeIcon className="h-12 w-12" />}
          title={t("noScrapers")}
          subtitle={t("noScrapersDescription")}
        />
      }
      getRowId={(row) => String(row.scraper.id)}
      renderExpandedRow={(row) => <ScraperRunHistory scraperId={row.scraper.id} />}
    />
  );
};
