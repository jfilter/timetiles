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
} from "@timetiles/ui";
import { CodeIcon, MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
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

/** Flat row combining scraper data with its repo name. */
interface ScraperRow {
  scraper: Scraper;
  repoName: string;
  repoId: number;
}

const getStatusVariant = (status: Scraper["lastRunStatus"]): StatusVariant => {
  if (!status) return "muted";
  if (status === "running") return "info";
  if (status === "success") return "success";
  if (status === "timeout") return "warning";
  return "error";
};

const ActionsCell = ({ row }: { readonly row: ScraperRow }) => {
  const t = useTranslations("ImportActivity");
  const runMutation = useRunScraperMutation();
  const syncMutation = useSyncScraperRepoMutation();
  const deleteMutation = useDeleteScraperRepoMutation();

  const handleRun = () => {
    runMutation.mutate(row.scraper.id);
  };

  const handleSync = () => {
    syncMutation.mutate(row.repoId);
  };

  const handleDelete = () => {
    if (!confirm(t("confirmDeleteRepo"))) return;
    deleteMutation.mutate(row.repoId);
  };

  return (
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
  );
};

export const ScrapersTable = ({ initialRepos, initialScrapers }: ScrapersTableProps) => {
  const t = useTranslations("ImportActivity");
  const { data: repos = [] } = useScraperReposQuery(initialRepos);
  const { data: allScrapers = [] } = useScrapersQuery(undefined, initialScrapers);

  const repoMap = useMemo(() => {
    const map = new Map<number, ScraperRepo>();
    for (const repo of repos) {
      map.set(repo.id, repo);
    }
    return map;
  }, [repos]);

  const rows = useMemo<ScraperRow[]>(() => {
    return allScrapers.map((scraper) => {
      const repoId = typeof scraper.repo === "object" ? scraper.repo.id : scraper.repo;
      const repo = repoMap.get(repoId);
      return { scraper, repoName: repo?.name ?? String(repoId), repoId };
    });
  }, [allScrapers, repoMap]);

  const getStatusLabel = useCallback(
    (status: Scraper["lastRunStatus"]): string => {
      if (!status) return t("statusNeverRun");
      if (status === "running") return t("statusRunning");
      if (status === "success") return t("statusSuccess");
      if (status === "timeout") return t("statusTimeout");
      return t("statusFailed");
    },
    [t]
  );

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
          return <StatusBadge variant={getStatusVariant(status)} label={getStatusLabel(status)} />;
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
    [t, getStatusLabel]
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
