/**
 * Run history and log viewer for a scraper.
 *
 * Displays recent runs with expandable stdout/stderr logs.
 *
 * @module
 * @category Components
 */
"use client";

import { Card } from "@timetiles/ui";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useScraperRunsQuery } from "@/lib/hooks/use-scrapers-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { ScraperRun } from "@/payload-types";

const formatDuration = (ms: number | null | undefined) => {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const statusColors: Record<string, string> = {
  success: "text-green-700 dark:text-green-400",
  failed: "text-red-700 dark:text-red-400",
  timeout: "text-amber-700 dark:text-amber-400",
  running: "text-blue-700 dark:text-blue-400",
  queued: "text-gray-500",
};

const RunEntry = ({ run }: { run: ScraperRun }) => {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("Scrapers");

  // Map the status enum to a translated label via literal keys (next-intl's `t`
  // requires statically-known keys; an unknown status falls back to its raw value).
  const statusLabel = ((): string => {
    switch (run.status) {
      case "success":
        return t("success");
      case "failed":
        return t("failedStatus");
      case "timeout":
        return t("timeout");
      case "running":
        return t("running");
      case "queued":
        return t("queued");
      default:
        return run.status;
    }
  })();

  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left text-xs"
      >
        {expanded ? (
          <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 flex-shrink-0" />
        )}
        <span className={`font-medium ${statusColors[run.status] ?? ""}`}>{statusLabel}</span>
        <span className="text-muted-foreground">{formatDateLocale(run.startedAt ?? run.createdAt)}</span>
        <span className="text-muted-foreground">{formatDuration(run.durationMs)}</span>
        {run.triggeredBy && (
          <span className="text-muted-foreground">{t("triggeredVia", { trigger: run.triggeredBy })}</span>
        )}
        {run.outputRows != null && run.outputRows > 0 && (
          <span className="text-muted-foreground">{t("outputRows", { count: run.outputRows })}</span>
        )}
      </button>
      {expanded && (
        <div className="bg-muted/30 space-y-2 px-3 pt-1 pb-3">
          {run.error && (
            <div>
              <div className="text-destructive text-xs font-medium">{t("errorLabel")}</div>
              <pre className="bg-background mt-1 max-h-32 overflow-auto rounded p-2 font-mono text-xs">{run.error}</pre>
            </div>
          )}
          {run.stdout && (
            <div>
              <div className="text-muted-foreground text-xs font-medium">stdout</div>
              <pre className="bg-background mt-1 max-h-48 overflow-auto rounded p-2 font-mono text-xs">
                {run.stdout}
              </pre>
            </div>
          )}
          {run.stderr && (
            <div>
              <div className="text-muted-foreground text-xs font-medium">stderr</div>
              <pre className="bg-background mt-1 max-h-48 overflow-auto rounded p-2 font-mono text-xs">
                {run.stderr}
              </pre>
            </div>
          )}
          {!run.error && !run.stdout && !run.stderr && (
            <div className="text-muted-foreground text-xs">{t("noOutputCaptured")}</div>
          )}
        </div>
      )}
    </div>
  );
};

export const ScraperRunLog = ({ scraperId }: { scraperId: number }) => {
  const { data: runs = [], isLoading } = useScraperRunsQuery(scraperId);
  const t = useTranslations("Scrapers");

  if (isLoading) {
    return <div className="text-muted-foreground py-3 pl-6 text-xs">{t("loadingRunHistory")}</div>;
  }

  if (runs.length === 0) {
    return <div className="text-muted-foreground py-3 pl-6 text-xs">{t("noRunsYet")}</div>;
  }

  return (
    <Card className="mt-2 ml-6 overflow-hidden">
      {runs.map((run) => (
        <RunEntry key={run.id} run={run} />
      ))}
    </Card>
  );
};
