/**
 * Expandable row detail showing recent scraper runs.
 *
 * Simplified inline version of the ScraperRunLog pattern, designed
 * to render inside an expanded table row without Card wrappers.
 *
 * @module
 * @category Components
 */
"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useScraperRunsQuery } from "@/lib/hooks/use-scrapers-query";
import { formatDateLocale, formatDuration } from "@/lib/utils/date";
import type { ScraperRun } from "@/payload-types";

interface ScraperRunHistoryProps {
  readonly scraperId: number;
}

const statusColors: Record<string, string> = {
  success: "bg-green-500",
  failed: "bg-red-500",
  timeout: "bg-amber-500",
  running: "bg-blue-500",
  queued: "bg-gray-400",
};

const RunRow = ({ run }: { readonly run: ScraperRun }) => {
  const t = useTranslations("ImportActivity");

  return (
    <div className="border-border border-b py-1.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${statusColors[run.status] ?? "bg-gray-400"}`}
          aria-label={run.status}
        />
        <span className="font-medium">{run.status}</span>
        <span className="text-muted-foreground">{formatDateLocale(run.startedAt ?? run.createdAt)}</span>
        <span className="text-muted-foreground">{formatDuration(run.durationMs)}</span>
        {run.triggeredBy && (
          <span className="text-muted-foreground rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            {run.triggeredBy}
          </span>
        )}
        {run.outputRows != null && run.outputRows > 0 && (
          <span className="text-muted-foreground">{t("rowCount", { count: run.outputRows })}</span>
        )}
        <Link
          href={`/dashboard/collections/scraper-runs/${run.id}`}
          className="text-muted-foreground hover:text-foreground ml-auto"
          onClick={(e) => e.stopPropagation()}
          title={t("viewInDashboard")}
        >
          <ExternalLinkIcon className="h-3 w-3" />
        </Link>
      </div>
      {run.status === "failed" && run.error && (
        <div className="text-destructive mt-0.5 truncate pl-4 text-xs">{run.error}</div>
      )}
    </div>
  );
};

export const ScraperRunHistory = ({ scraperId }: ScraperRunHistoryProps) => {
  const t = useTranslations("ImportActivity");
  const { data: runs = [], isLoading } = useScraperRunsQuery(scraperId);

  if (isLoading) {
    return <div className="text-muted-foreground py-2 text-xs">{t("loadingRuns")}</div>;
  }

  if (runs.length === 0) {
    return <div className="text-muted-foreground py-2 text-xs">{t("noRuns")}</div>;
  }

  return (
    <div className="space-y-0">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
};
