/**
 * Expandable row detail showing execution history for a scheduled ingest.
 *
 * Renders a compact list of past executions with status, duration, record count,
 * trigger source, and error messages. No data fetching -- data comes from the parent.
 *
 * @module
 * @category Components
 */
"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatDateLocale, formatDuration } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

interface ScheduleRunHistoryProps {
  readonly scheduleId: number;
  readonly executionHistory: ScheduledIngest["executionHistory"];
}

const statusDotClass: Record<string, string> = { success: "bg-green-500", failed: "bg-red-500" };

type HistoryEntry = NonNullable<ScheduledIngest["executionHistory"]>[number];

const HistoryRow = ({ entry }: { readonly entry: HistoryEntry }) => {
  const t = useTranslations("ImportActivity");

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b py-1.5 text-xs last:border-b-0">
      <span
        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass[entry.status] ?? "bg-gray-400"}`}
        aria-label={entry.status}
      />
      <span className="text-muted-foreground">{formatDateLocale(entry.executedAt)}</span>
      <span className="text-muted-foreground">{formatDuration(entry.duration)}</span>
      {entry.recordsImported != null && (
        <span className="text-muted-foreground">{t("recordCount", { count: entry.recordsImported })}</span>
      )}
      {entry.triggeredBy && (
        <span className="text-muted-foreground rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
          {entry.triggeredBy}
        </span>
      )}
      {entry.status === "failed" && entry.error && (
        <span className="text-destructive ml-auto max-w-[300px] truncate">{entry.error}</span>
      )}
    </div>
  );
};

export const ScheduleRunHistory = ({ scheduleId, executionHistory }: ScheduleRunHistoryProps) => {
  const t = useTranslations("ImportActivity");

  if (!executionHistory || executionHistory.length === 0) {
    return <div className="text-muted-foreground py-2 text-xs">{t("noExecutionHistory")}</div>;
  }

  return (
    <div className="space-y-0">
      {executionHistory.map((entry) => (
        <HistoryRow key={entry.id ?? entry.executedAt} entry={entry} />
      ))}
      <div className="pt-2">
        <Link
          href={`/dashboard/collections/scheduled-ingests/${scheduleId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLinkIcon className="h-3 w-3" />
          {t("viewInDashboard")}
        </Link>
      </div>
    </div>
  );
};
