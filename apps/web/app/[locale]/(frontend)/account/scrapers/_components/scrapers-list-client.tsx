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
import { useState } from "react";

import {
  useDeleteScraperRepoMutation,
  useRunScraperMutation,
  useSyncScraperRepoMutation,
} from "@/lib/hooks/use-scraper-mutations";
import { useScraperReposQuery } from "@/lib/hooks/use-scrapers-query";
import type { Scraper, ScraperRepo } from "@/payload-types";

import { ScraperRunLog } from "./scraper-run-log";

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
};

const getSyncStatusBadge = (repo: ScraperRepo) => {
  if (!repo.lastSyncAt) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <ClockIcon className="h-3 w-3" />
        Pending
      </span>
    );
  }

  if (repo.lastSyncStatus === "failed") {
    return (
      <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <XCircleIcon className="h-3 w-3" />
        Sync Failed
      </span>
    );
  }

  return (
    <span className="bg-cartographic-forest/10 text-cartographic-forest inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <CheckCircle2Icon className="h-3 w-3" />
      Synced
    </span>
  );
};

const getRunStatusBadge = (scraper: Scraper) => {
  const status = scraper.lastRunStatus;
  if (!status) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        Never run
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        <Loader2Icon className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }

  if (status === "success") {
    return (
      <span className="bg-cartographic-forest/10 text-cartographic-forest inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <CheckCircle2Icon className="h-3 w-3" />
        Success
      </span>
    );
  }

  if (status === "timeout") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <AlertCircleIcon className="h-3 w-3" />
        Timeout
      </span>
    );
  }

  return (
    <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <XCircleIcon className="h-3 w-3" />
      Failed
    </span>
  );
};

interface ScraperCardProps {
  scraper: Scraper;
  loadingState?: string;
  onRun: () => void;
  onViewLogs: () => void;
  showLogs: boolean;
}

const ScraperCard = ({ scraper, loadingState, onRun, onViewLogs, showLogs }: ScraperCardProps) => {
  const isLoading = Boolean(loadingState);
  const stats = scraper.statistics as { totalRuns?: number; successRuns?: number; failedRuns?: number } | null;

  return (
    <div className="border-border border-t pt-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CodeIcon className="text-muted-foreground h-4 w-4 flex-shrink-0" />
            <span className="truncate font-medium">{scraper.name}</span>
            {getRunStatusBadge(scraper)}
            {!scraper.enabled && (
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs">
                Disabled
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap gap-3 pl-6 text-xs">
            <span>
              {scraper.runtime} &middot; {scraper.entrypoint}
            </span>
            {scraper.schedule && <span>Schedule: {scraper.schedule}</span>}
            {scraper.lastRunAt && <span>Last run: {formatDate(scraper.lastRunAt)}</span>}
            {stats?.totalRuns != null && stats.totalRuns > 0 && (
              <span>
                {stats.totalRuns} runs ({stats.successRuns ?? 0} ok, {stats.failedRuns ?? 0} failed)
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
            title="Run scraper"
          >
            {loadingState === "running" ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewLogs} title="View run history">
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
}

const RepoCard = ({
  repo,
  scrapers,
  loadingState,
  scraperLoadingStates,
  onSync,
  onDelete,
  onRunScraper,
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
              {getSyncStatusBadge(repo)}
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
                  <span className="text-xs">Uploaded code</span>
                </>
              )}
            </div>

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-xs">
              {repo.lastSyncAt && <span>Last synced: {formatDate(repo.lastSyncAt)}</span>}
              {repo.lastSyncError && (
                <span className="text-destructive truncate" title={repo.lastSyncError}>
                  Error: {repo.lastSyncError.substring(0, 80)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSync} disabled={isLoading} title="Force sync">
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
              title="Delete repo"
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
              />
            ))}
          </div>
        )}

        {scrapers.length === 0 && repo.lastSyncAt && (
          <div className="text-muted-foreground mt-4 border-t pt-3 text-sm">No scrapers found in manifest.</div>
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
  const { data: repos = [] } = useScraperReposQuery(initialRepos);
  const [allScrapers] = useState(initialScrapers);
  const [repoLoadingStates, setRepoLoadingStates] = useState<Record<number, string>>({});
  const [scraperLoadingStates, setScraperLoadingStates] = useState<Record<number, string>>({});

  const syncMutation = useSyncScraperRepoMutation();
  const deleteMutation = useDeleteScraperRepoMutation();
  const runMutation = useRunScraperMutation();

  const clearRepoLoading = (id: number) => {
    setRepoLoadingStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearScraperLoading = (id: number) => {
    setScraperLoadingStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSync = (repoId: number) => {
    setRepoLoadingStates((prev) => ({ ...prev, [repoId]: "syncing" }));
    syncMutation.mutate(repoId, { onSettled: () => clearRepoLoading(repoId) });
  };

  const handleDelete = (repoId: number) => {
    if (!confirm("Are you sure you want to delete this scraper repo and all its scrapers?")) return;
    setRepoLoadingStates((prev) => ({ ...prev, [repoId]: "deleting" }));
    deleteMutation.mutate(repoId, { onSettled: () => clearRepoLoading(repoId) });
  };

  const handleRunScraper = (scraperId: number) => {
    setScraperLoadingStates((prev) => ({ ...prev, [scraperId]: "running" }));
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
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CodeIcon className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">No scraper repos</h3>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            Create a scraper repo from the admin dashboard to start scraping data.
          </p>
        </CardContent>
      </Card>
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
        />
      ))}
    </div>
  );
};
