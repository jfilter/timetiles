/**
 * Expandable row detail showing ingest jobs for a given ingest file.
 *
 * Renders a compact list of processing jobs with stage, dataset, error count,
 * and timestamps. Designed to sit inside an expanded table row.
 *
 * @module
 * @category Components
 */
"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { Link } from "@/i18n/navigation";
import { useIngestJobsByFileQuery } from "@/lib/hooks/use-ingest-jobs-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { Dataset, IngestJob } from "@/payload-types";

interface IngestJobsDetailProps {
  readonly ingestFileId: number;
}

const STAGE_VARIANT_MAP: Record<string, StatusVariant> = {
  completed: "success",
  failed: "error",
  "needs-review": "warning",
};

const getStageVariant = (stage: IngestJob["stage"]): StatusVariant => STAGE_VARIANT_MAP[stage] ?? "info";

const getDatasetLabel = (dataset: number | Dataset): string => {
  if (typeof dataset === "object") {
    return dataset.name;
  }
  return `#${String(dataset)}`;
};

const MAX_VISIBLE_ERRORS = 3;

const JobRow = ({ job }: { readonly job: IngestJob }) => {
  const t = useTranslations("ImportActivity");
  const errorCount = job.errors?.length ?? 0;

  return (
    <div className="border-border border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{getDatasetLabel(job.dataset)}</span>
        <StatusBadge variant={getStageVariant(job.stage)} label={job.stage} />
        {errorCount > 0 && <span className="text-destructive text-xs">{t("errorCount", { count: errorCount })}</span>}
        <span className="text-muted-foreground ml-auto flex items-center gap-2">
          {formatDateLocale(job.createdAt)}
          <Link
            href={`/dashboard/collections/ingest-jobs/${job.id}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
            title={t("viewInDashboard")}
          >
            <ExternalLinkIcon className="h-3 w-3" />
          </Link>
        </span>
      </div>
      {errorCount > 0 && job.errors && (
        <div className="mt-1 space-y-0.5 pl-2">
          {job.errors.slice(0, MAX_VISIBLE_ERRORS).map((err) => (
            <div key={err.id ?? err.row} className="text-muted-foreground truncate text-xs">
              {t("errorRow", { row: err.row, error: err.error })}
            </div>
          ))}
          {errorCount > MAX_VISIBLE_ERRORS && (
            <div className="text-muted-foreground text-xs">
              {t("moreErrors", { count: errorCount - MAX_VISIBLE_ERRORS })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const IngestJobsDetail = ({ ingestFileId }: IngestJobsDetailProps) => {
  const t = useTranslations("ImportActivity");
  const { data: jobs = [], isLoading } = useIngestJobsByFileQuery(ingestFileId);

  if (isLoading) {
    return <div className="text-muted-foreground py-2 text-xs">{t("loadingJobs")}</div>;
  }

  if (jobs.length === 0) {
    return <div className="text-muted-foreground py-2 text-xs">{t("noJobs")}</div>;
  }

  return (
    <div className="space-y-0">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  );
};
