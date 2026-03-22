/**
 * Table component for displaying manual import (IngestFile) records.
 *
 * Shows file name, status, dataset progress, size, and timestamps
 * in a sortable, paginated DataTable.
 *
 * @module
 * @category Components
 */
"use client";

import { type ColumnDef, ContentState, DataTable } from "@timetiles/ui";
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useIngestFilesQuery } from "@/lib/hooks/use-ingest-files-query";
import { formatDateLocale } from "@/lib/utils/date";
import type { IngestFile } from "@/payload-types";

import { IngestJobsDetail } from "./ingest-jobs-detail";

interface ManualImportsTableProps {
  readonly initialData: IngestFile[];
}

const STATUS_VARIANT_MAP: Record<string, StatusVariant> = {
  pending: "muted",
  parsing: "info",
  processing: "info",
  completed: "success",
  failed: "error",
};

const getStatusVariant = (status: string | null | undefined): StatusVariant => {
  if (!status) return "muted";
  return STATUS_VARIANT_MAP[status] ?? "muted";
};

const KB = 1024;
const MB = 1024 * KB;

const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "-";
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
};

export const ManualImportsTable = ({ initialData }: ManualImportsTableProps) => {
  const t = useTranslations("ImportActivity");
  const { data: ingestFiles = [], isLoading } = useIngestFilesQuery(initialData);

  const columns = useMemo<ColumnDef<IngestFile, unknown>[]>(
    () => [
      {
        accessorKey: "originalName",
        header: t("fileName"),
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate font-medium" title={row.original.originalName ?? undefined}>
            {row.original.originalName ?? row.original.filename ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("status"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <StatusBadge variant={getStatusVariant(status)} label={status ?? t("statusPending")} />;
        },
      },
      {
        accessorKey: "datasetsProcessed",
        header: t("datasets"),
        cell: ({ row }) => {
          const processed = row.original.datasetsProcessed ?? 0;
          const total = row.original.datasetsCount ?? 0;
          return (
            <span className="text-muted-foreground text-sm">
              {processed}/{total}
            </span>
          );
        },
      },
      {
        accessorKey: "filesize",
        header: t("size"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatFileSize(row.original.filesize)}</span>
        ),
      },
      {
        accessorKey: "uploadedAt",
        header: t("uploaded"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{formatDateLocale(row.original.uploadedAt)}</span>
        ),
      },
      {
        accessorKey: "completedAt",
        header: t("completed"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.completedAt ? formatDateLocale(row.original.completedAt) : "-"}
          </span>
        ),
      },
    ],
    [t]
  );

  return (
    <DataTable
      columns={columns}
      data={ingestFiles}
      isLoading={isLoading}
      emptyState={
        <ContentState
          variant="empty"
          icon={<UploadIcon className="h-12 w-12" />}
          title={t("noImports")}
          subtitle={t("noImportsDescription")}
        />
      }
      getRowId={(row) => String(row.id)}
      renderExpandedRow={(row) => <IngestJobsDetail ingestFileId={row.id} />}
    />
  );
};
