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
import { useCallback, useMemo } from "react";

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

interface LatestExport {
  id?: number;
  status?: string;
  requestedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  fileSize?: number | null;
  errorLog?: string;
}

/**
 * Info box showing what's included in the export.
 */
const ExportInfoBox = () => (
  <div className="bg-muted rounded-md p-4">
    <p className="text-muted-foreground mb-2 text-sm font-medium">Your export will include:</p>
    <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
      <li>Catalogs and datasets you created</li>
      <li>All events in your datasets</li>
      <li>Import history and scheduled imports</li>
      <li>Media files you uploaded</li>
    </ul>
  </div>
);

/**
 * Pending/Processing state display.
 */
const ExportPendingState = ({ requestedAt }: { requestedAt?: string | null }) => (
  <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950">
    <div className="flex items-start gap-3">
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      <div>
        <p className="font-medium text-blue-700 dark:text-blue-300">Export in progress...</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your data export was requested on {formatExportDate(requestedAt)}.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">We&apos;ll send you an email when it&apos;s ready.</p>
      </div>
    </div>
  </div>
);

/**
 * Ready state display with download info.
 */
const ExportReadyState = ({ latestExport }: { latestExport: LatestExport }) => (
  <div className="rounded-md border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950">
    <div className="flex items-start gap-3">
      <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
      <div className="flex-1">
        <p className="font-medium text-green-700 dark:text-green-300">Your data export is ready!</p>
        <div className="text-muted-foreground mt-2 space-y-1 text-sm">
          <p>
            <span className="font-medium">Created:</span> {formatExportDate(latestExport.completedAt)}
          </p>
          <p>
            <span className="font-medium">Size:</span> {formatFileSize(latestExport.fileSize)}
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

/**
 * Failed state display.
 */
const ExportFailedState = ({ errorLog }: { errorLog?: string }) => (
  <div className="bg-destructive/10 border-destructive rounded-md border-l-4 p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="text-destructive h-5 w-5" />
      <div>
        <p className="text-destructive font-medium">Export failed</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We couldn&apos;t generate your data export. This may be a temporary issue. Please try again.
        </p>
        {errorLog && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Error: {errorLog}</p>}
      </div>
    </div>
  </div>
);

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
  const { isPending, isReady, isFailed } = status;

  if (isReady) {
    return (
      <>
        <Button onClick={onDownload} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          Download Export
        </Button>
        <Button variant="outline" onClick={onRequestExport} disabled={isRequesting} className="w-full sm:w-auto">
          {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Request New Export
        </Button>
      </>
    );
  }

  if (isFailed) {
    return (
      <Button onClick={onRequestExport} disabled={isRequesting} className="w-full sm:w-auto">
        {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Try Again
      </Button>
    );
  }

  return (
    <Button onClick={onRequestExport} disabled={isPending || isRequesting || isLoading} className="w-full sm:w-auto">
      {(isPending || isRequesting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {isPending ? "Export in Progress..." : "Request Data Export"}
    </Button>
  );
};

/**
 * Card for managing data exports.
 */
export const DataExportCard = () => {
  const { latestExport, isLoading } = useLatestExportQuery();
  const requestExport = useRequestDataExportMutation();

  const handleRequestExport = useCallback(() => {
    requestExport.mutate();
  }, [requestExport]);

  const handleDownload = useCallback(() => {
    if (latestExport?.id) {
      window.location.href = getExportDownloadUrl(latestExport.id);
    }
  }, [latestExport?.id]);

  const status: ExportStatus = useMemo(
    () => ({
      isPending: latestExport?.status === "pending" || latestExport?.status === "processing",
      isReady: latestExport?.status === "ready",
      isFailed: latestExport?.status === "failed",
    }),
    [latestExport?.status]
  );

  const showInfoBox = !status.isPending && !status.isReady && !status.isFailed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Download My Data
        </CardTitle>
        <CardDescription>Export all your data in a portable format</CardDescription>
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

        {showInfoBox && (
          <p className="text-muted-foreground text-xs">
            Processing may take a few minutes. You&apos;ll receive an email when your export is ready.
          </p>
        )}

        {status.isReady && (
          <p className="text-muted-foreground text-xs">Download links are available for 7 days after generation.</p>
        )}

        {requestExport.isError && (
          <p className="text-destructive text-sm">
            {requestExport.error instanceof Error
              ? requestExport.error.message
              : "Failed to request export. Please try again."}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
