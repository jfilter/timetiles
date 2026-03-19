/**
 * Card component for data export functionality.
 *
 * Allows users to request and download exports of all their data.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@timetiles/ui";
import { AlertTriangle, Check, Clock, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DataExport } from "@/lib/hooks/use-data-export";
import {
  formatExportDate,
  formatFileSize,
  getExportDownloadUrl,
  getTimeUntilExpiry,
  useLatestExportQuery,
  useRequestDataExportMutation,
} from "@/lib/hooks/use-data-export";

interface ExportStatus {
  isPending: boolean;
  isReady: boolean;
  isFailed: boolean;
}

/**
 * Info box showing what's included in the export.
 */
const ExportInfoBox = () => {
  const t = useTranslations("DataExport");
  return (
    <div className="bg-muted rounded-md p-4">
      <p className="text-muted-foreground mb-2 text-sm font-medium">{t("includesTitle")}</p>
      <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
        <li>{t("includesCatalogs")}</li>
        <li>{t("includesEvents")}</li>
        <li>{t("includesImports")}</li>
        <li>{t("includesMedia")}</li>
      </ul>
    </div>
  );
};

/**
 * Pending/Processing state display.
 */
const ExportPendingState = ({ requestedAt }: { requestedAt?: string | null }) => {
  const t = useTranslations("DataExport");
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950">
      <div className="flex items-start gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <div>
          <p className="font-medium text-blue-700 dark:text-blue-300">{t("inProgress")}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("requestedOn", { date: formatExportDate(requestedAt) })}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{t("emailWhenReady")}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Ready state display with download info.
 */
const ExportReadyState = ({ latestExport }: { latestExport: DataExport }) => {
  const t = useTranslations("DataExport");
  return (
    <div className="rounded-md border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950">
      <div className="flex items-start gap-3">
        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
        <div className="flex-1">
          <p className="font-medium text-green-700 dark:text-green-300">{t("ready")}</p>
          <div className="text-muted-foreground mt-2 space-y-1 text-sm">
            <p>
              <span className="font-medium">{t("createdLabel")}</span> {formatExportDate(latestExport.completedAt)}
            </p>
            <p>
              <span className="font-medium">{t("sizeLabel")}</span> {formatFileSize(latestExport.fileSize)}
            </p>
            {latestExport.expiresAt && (
              <p className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{getTimeUntilExpiry(latestExport.expiresAt)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Failed state display.
 */
const ExportFailedState = ({ errorLog }: { errorLog?: string }) => {
  const t = useTranslations("DataExport");
  return (
    <div className="bg-destructive/10 border-destructive rounded-md border-l-4 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive h-5 w-5" />
        <div>
          <p className="text-destructive font-medium">{t("exportFailed")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("exportFailedDescription")}</p>
          {errorLog && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errorLog}</p>}
        </div>
      </div>
    </div>
  );
};

/**
 * Action buttons based on export status.
 */
const ExportActions = ({
  status,
  onDownload,
  onRequestExport,
  isRequesting,
  isLoading,
}: {
  status: ExportStatus;
  onDownload: () => void;
  onRequestExport: () => void;
  isRequesting: boolean;
  isLoading: boolean;
}) => {
  const t = useTranslations("DataExport");
  const tCommon = useTranslations("Common");
  const { isPending, isReady, isFailed } = status;

  if (isReady) {
    return (
      <>
        <Button onClick={onDownload} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          {t("downloadExport")}
        </Button>
        <Button variant="outline" onClick={onRequestExport} disabled={isRequesting} className="w-full sm:w-auto">
          {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("requestNewExport")}
        </Button>
      </>
    );
  }

  if (isFailed) {
    return (
      <Button onClick={onRequestExport} disabled={isRequesting} className="w-full sm:w-auto">
        {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {tCommon("tryAgain")}
      </Button>
    );
  }

  return (
    <Button onClick={onRequestExport} disabled={isPending || isRequesting || isLoading} className="w-full sm:w-auto">
      {(isPending || isRequesting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {isPending ? t("exportInProgress") : t("requestDataExport")}
    </Button>
  );
};

/**
 * Card for managing data exports.
 */
export const DataExportCard = () => {
  const t = useTranslations("DataExport");
  const { latestExport, isLoading } = useLatestExportQuery();
  const requestExport = useRequestDataExportMutation();

  const handleRequestExport = () => {
    requestExport.mutate();
  };

  const handleDownload = () => {
    if (latestExport?.id) {
      globalThis.location.href = getExportDownloadUrl(latestExport.id);
    }
  };

  const status: ExportStatus = {
    isPending: latestExport?.status === "pending" || latestExport?.status === "processing",
    isReady: latestExport?.status === "ready",
    isFailed: latestExport?.status === "failed",
  };

  const showInfoBox = !status.isPending && !status.isReady && !status.isFailed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showInfoBox && <ExportInfoBox />}
        {status.isPending && <ExportPendingState requestedAt={latestExport?.requestedAt} />}
        {status.isReady && latestExport && <ExportReadyState latestExport={latestExport} />}
        {status.isFailed && <ExportFailedState errorLog={latestExport?.errorLog} />}

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <ExportActions
            status={status}
            onDownload={handleDownload}
            onRequestExport={handleRequestExport}
            isRequesting={requestExport.isPending}
            isLoading={isLoading}
          />
        </div>

        {showInfoBox && <p className="text-muted-foreground text-xs">{t("processingTime")}</p>}

        {status.isReady && <p className="text-muted-foreground text-xs">{t("downloadExpiry")}</p>}

        {requestExport.isError && (
          <p className="text-destructive text-sm">
            {requestExport.error instanceof Error ? requestExport.error.message : t("requestError")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
