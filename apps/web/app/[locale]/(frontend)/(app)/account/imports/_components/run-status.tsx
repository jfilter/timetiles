/**
 * Localized status display shared by scraper and scheduled import histories.
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";

import type { ScheduledIngest, ScraperRun } from "@/payload-types";

type RunStatusValue = ScraperRun["status"] | NonNullable<ScheduledIngest["executionHistory"]>[number]["status"];

const STATUS_DISPLAY = {
  success: { color: "bg-green-500", label: "statusSuccess" },
  failed: { color: "bg-red-500", label: "statusFailed" },
  timeout: { color: "bg-amber-500", label: "statusTimeout" },
  running: { color: "bg-blue-500", label: "statusRunning" },
  queued: { color: "bg-gray-400", label: "statusPending" },
  paused: { color: "bg-gray-400", label: "statusAwaitingReview" },
} as const satisfies Record<RunStatusValue, { color: string; label: string }>;

export const RunStatus = ({ status }: { readonly status: RunStatusValue }) => {
  const t = useTranslations("ImportActivity");
  const display = STATUS_DISPLAY[status];
  return (
    <span className="inline-flex items-center gap-2 font-medium">
      <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${display.color}`} aria-hidden="true" />
      {t(display.label)}
    </span>
  );
};
