/**
 * Client component for listing and managing scraper repos and their scrapers.
 *
 * Displays repos in a card list with sync status, scrapers, and action buttons.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeIcon,
  GitBranchIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyResourceCard } from "@/app/[locale]/(frontend)/account/_components/empty-resource-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLoadingStates } from "@/lib/hooks/use-loading-states";
import {
  useDeleteScraperRepoMutation,
  useRunScraperMutation,
  useSyncScraperRepoMutation,
} from "@/lib/hooks/use-scraper-mutations";
import { useScraperReposQuery, useScrapersQuery } from "@/lib/hooks/use-scrapers-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { Scraper, ScraperRepo } from "@/payload-types";

import { ScraperRunLog } from "./scraper-run-log";

type TranslateFn = ReturnType<typeof useTranslations<"Scrapers">>;

const getSyncStatusBadge = (repo: ScraperRepo, t: TranslateFn) => {
  if (!repo.lastSyncAt) {
    return <StatusBadge variant="muted" label={t("pending")} icon={<ClockIcon className="h-3 w-3" />} />;
  }
  if (repo.lastSyncStatus === "failed") {
    return <StatusBadge variant="error" label={t("syncFailed")} icon={<XCircleIcon className="h-3 w-3" />} />;
  }
  return <StatusBadge variant="success" label={t("synced")} icon={<CheckCircle2Icon className="h-3 w-3" />} />;
};

const getRunStatusBadge = (scraper: Scraper, t: TranslateFn) => {
  const status = scraper.lastRunStatus;
  if (!status) {
    return <StatusBadge variant="muted" label={t("neverRun")} />;
  }
  if (status === "running") {
    return <StatusBadge variant="info" label={t("running")} icon={<Loader2Icon className="h-3 w-3 animate-spin" />} />;
  }
  if (status === "success") {
    return <StatusBadge variant="success" label={t("success")} icon={<CheckCircle2Icon className="h-3 w-3" />} />;
  }
  if (status === "timeout") {
    return <StatusBadge variant="warning" label={t("timeout")} icon={<AlertCircleIcon className="h-3 w-3" />} />;
  }
  return <StatusBadge variant="error" label={t("failedStatus")} icon={<XCircleIcon className="h-3 w-3" />} />;
};

interface ScraperCardProps {
  scraper: Scraper;
  loadingState?: string;
  onRun: () => void;
  onViewLogs: () => void;
  showLogs: boolean;
  t: TranslateFn;
}

const ScraperCard = ({ scraper, loadingState, onRun, onViewLogs, showLogs, t }: ScraperCardProps) => {
  const isLoading = Boolean(loadingState);
  const stats = scraper.statistics as { totalRuns?: number; successRuns?: number; failedRuns?: number } | null;

  return (
    <div className="border-border border-t pt-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CodeIcon className="text-muted-foreground h-4 w-4 flex-shrink-0" />
            <span className="truncate font-medium">{scraper.name}</span>
            {getRunStatusBadge(scraper, t)}
            {!scraper.enabled && (
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs">
                {t("disabledStatus")}
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap gap-3 pl-6 text-xs">
            <span>
              {scraper.runtime} &middot; {scraper.entrypoint}
            </span>
            {scraper.schedule && <span>{t("schedule", { schedule: scraper.schedule })}</span>}
            {scraper.lastRunAt && <span>{t("lastRunAt", { date: formatDateLocale(scraper.lastRunAt) })}</span>}
            {stats?.totalRuns != null && stats.totalRuns > 0 && (
              <span>
                {t("runsStats", {
                  total: stats.totalRuns,
                  success: stats.successRuns ?? 0,
                  failed: stats.failedRuns ?? 0,
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRun}
            disabled={isLoading || scraper.lastRunStatus === "running"}
            title={t("runScraper")}
          >
            {loadingState === "running" ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewLogs} title={t("viewRunHistory")}>
            {showLogs ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {showLogs && <ScraperRunLog scraperId={scraper.id} />}
    </div>
  );
};

interface RepoCardProps {
  repo: ScraperRepo;
  scrapers: Scraper[];
  loadingState?: string;
  scraperLoadingStates: Record<number, string>;
  onSync: () => void;
  onDelete: () => void;
  onRunScraper: (id: number) => void;
  t: TranslateFn;
}

const RepoCard = ({
  repo,
  scrapers,
  loadingState,
  scraperLoadingStates,
  onSync,
  onDelete,
  onRunScraper,
  t,
}: RepoCardProps) => {
  const isLoading = Boolean(loadingState);
  const [expandedScrapers, setExpandedScrapers] = useState<Set<number>>(new Set());

  const toggleScraperLogs = (scraperId: number) => {
    setExpandedScrapers((prev) => {
      const next = new Set(prev);
      if (next.has(scraperId)) {
        next.delete(scraperId);
      } else {
        next.add(scraperId);
      }
      return next;
    });
  };

  return (
    <Card className={cn("transition-opacity", isLoading && "pointer-events-none")}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-semibold">{repo.name}</h3>
              {getSyncStatusBadge(repo, t)}
            </div>

            <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              {repo.sourceType === "git" ? (
                <>
                  <GitBranchIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate font-mono text-xs">
                    {repo.gitUrl} ({repo.gitBranch ?? "main"})
                  </span>
                </>
              ) : (
                <>
                  <CodeIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs">{t("uploadedCode")}</span>
                </>
              )}
            </div>

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-xs">
              {repo.lastSyncAt && <span>{t("lastSynced", { date: formatDateLocale(repo.lastSyncAt) })}</span>}
              {repo.lastSyncError && (
                <span className="text-destructive truncate" title={repo.lastSyncError}>
                  {repo.lastSyncError.substring(0, 80)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSync} disabled={isLoading} title={t("forceSync")}>
              {loadingState === "syncing" ? (
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
              title={t("deleteRepo")}
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

        {/* Scrapers within this repo */}
        {scrapers.length > 0 && (
          <div className="mt-4 space-y-3">
            {scrapers.map((scraper) => (
              <ScraperCard
                key={scraper.id}
                scraper={scraper}
                loadingState={scraperLoadingStates[scraper.id]}
                onRun={() => onRunScraper(scraper.id)}
                onViewLogs={() => toggleScraperLogs(scraper.id)}
                showLogs={expandedScrapers.has(scraper.id)}
                t={t}
              />
            ))}
          </div>
        )}

        {scrapers.length === 0 && repo.lastSyncAt && (
          <div className="text-muted-foreground mt-4 border-t pt-3 text-sm">{t("noScrapersInManifest")}</div>
        )}
      </CardContent>
    </Card>
  );
};

interface ScrapersListClientProps {
  initialRepos: ScraperRepo[];
  initialScrapers: Scraper[];
}

export const ScrapersListClient = ({ initialRepos, initialScrapers }: ScrapersListClientProps) => {
  const t = useTranslations("Scrapers");
  const { data: repos = [] } = useScraperReposQuery(initialRepos);
  const { data: allScrapers = [] } = useScrapersQuery(undefined, initialScrapers);
  const { states: repoLoadingStates, setLoading: setRepoLoading, clearLoading: clearRepoLoading } = useLoadingStates();
  const {
    states: scraperLoadingStates,
    setLoading: setScraperLoading,
    clearLoading: clearScraperLoading,
  } = useLoadingStates();

  const syncMutation = useSyncScraperRepoMutation();
  const deleteMutation = useDeleteScraperRepoMutation();
  const runMutation = useRunScraperMutation();

  const handleSync = (repoId: number) => {
    setRepoLoading(repoId, "syncing");
    syncMutation.mutate(repoId, { onSettled: () => clearRepoLoading(repoId) });
  };

  const handleDelete = (repoId: number) => {
    if (!confirm(t("confirmDeleteRepo"))) return;
    setRepoLoading(repoId, "deleting");
    deleteMutation.mutate(repoId, { onSettled: () => clearRepoLoading(repoId) });
  };

  const handleRunScraper = (scraperId: number) => {
    setScraperLoading(scraperId, "running");
    runMutation.mutate(scraperId, { onSettled: () => clearScraperLoading(scraperId) });
  };

  // Group scrapers by repo
  const scrapersByRepo = allScrapers.reduce<Record<number, Scraper[]>>((acc, scraper) => {
    const repoId = typeof scraper.repo === "object" ? scraper.repo.id : scraper.repo;
    acc[repoId] ??= [];
    acc[repoId].push(scraper);
    return acc;
  }, {});

  if (repos.length === 0) {
    return (
      <EmptyResourceCard
        icon={<CodeIcon className="text-muted-foreground mb-4 h-12 w-12" />}
        title={t("noRepos")}
        description={t("noReposDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      {repos.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          scrapers={scrapersByRepo[repo.id] ?? []}
          loadingState={repoLoadingStates[repo.id]}
          scraperLoadingStates={scraperLoadingStates}
          onSync={() => handleSync(repo.id)}
          onDelete={() => handleDelete(repo.id)}
          onRunScraper={handleRunScraper}
          t={t}
        />
      ))}
    </div>
  );
};
