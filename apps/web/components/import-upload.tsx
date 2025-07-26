"use client";

import { useCallback, useRef, useState } from "react";

import { useImportProgressQuery, useImportUploadMutation } from "../lib/hooks/use-events-queries";

const getStatusIcon = (status: string): string => {
  switch (status) {
    case "completed":
      return "✅";
    case "failed":
      return "❌";
    case "processing":
      return "⏳";
    default:
      return "📄";
  }
};

const getProgressBarStyle = (percentage: number) => ({ width: `${percentage}%` });
const getBatchProgressStyle = (current: number, total: number) => ({
  width: `${(current / total) * 100}%`,
});

// Helper components to reduce complexity
const ErrorAlert = ({ error }: { error: string | null }) => {
  if (error == null || (typeof error === "string" && error.trim() === "")) return null;

  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
      <div className="flex items-center">
        <span className="mr-2 text-red-600">⚠️</span>
        <span className="text-red-800">{error}</span>
      </div>
    </div>
  );
};

const SuccessAlert = ({ success }: { success: string | null }) => {
  if (success == null || (typeof success === "string" && success.trim() === "")) return null;

  return (
    <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4">
      <div className="flex items-center">
        <span className="mr-2 text-green-600">✅</span>
        <span className="text-green-800">{success}</span>
      </div>
    </div>
  );
};

const FileInput = ({
  file,
  fileInputRef,
  onFileSelect,
  disabled,
}: {
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) => (
  <div>
    <label htmlFor="file" className="mb-2 block text-sm font-medium">
      Select File
    </label>
    <input
      ref={fileInputRef}
      id="file"
      type="file"
      accept=".csv,.xlsx,.xls"
      onChange={onFileSelect}
      disabled={disabled}
      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    />
    {file && (
      <p className="mt-1 text-sm text-gray-600">
        Selected: {file.name} ({Math.round(file.size / 1024)} KB)
      </p>
    )}
  </div>
);

const CatalogInput = ({
  catalogId,
  onCatalogChange,
  disabled,
}: {
  catalogId: string;
  onCatalogChange: (value: string) => void;
  disabled: boolean;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onCatalogChange(e.target.value),
    [onCatalogChange],
  );

  return (
    <div>
      <label htmlFor="catalogId" className="mb-2 block text-sm font-medium">
        Catalog ID
      </label>
      <input
        id="catalogId"
        type="text"
        placeholder="Enter catalog ID"
        value={catalogId}
        onChange={handleChange}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />
    </div>
  );
};

const UploadButtons = ({
  file,
  catalogId,
  uploading,
  importId,
  onUpload,
  onReset,
}: {
  file: File | null;
  catalogId: string;
  uploading: boolean;
  importId: string | null;
  onUpload: () => void;
  onReset: () => void;
}) => {
  const isDisabled =
    file == null ||
    catalogId == null ||
    (typeof catalogId === "string" && catalogId.trim() === "") ||
    uploading ||
    importId != null;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onUpload}
        disabled={isDisabled}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {uploading ? (
          <>
            <span className="animate-spin">⏳</span>
            Uploading...
          </>
        ) : (
          <>📤 Upload & Process</>
        )}
      </button>

      {importId != null && typeof importId === "string" && importId.trim() !== "" && (
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
        >
          Start New Import
        </button>
      )}
    </div>
  );
};

const ProgressStats = ({ progress }: { progress: ProgressResponse }) => (
  <div className="grid grid-cols-2 gap-4 text-sm">
    <div>
      <span className="font-medium">Status:</span> {progress.status}
    </div>
    <div>
      <span className="font-medium">Stage:</span> {progress.stage}
    </div>
    <div>
      <span className="font-medium">Processed:</span> {progress.progress.current} / {progress.progress.total}
    </div>
    <div>
      <span className="font-medium">Overall:</span> {progress.progress.percentage}%
    </div>
  </div>
);

const BatchProgress = ({ batchInfo }: { batchInfo: ProgressResponse["batchInfo"] }) => {
  if (batchInfo.totalBatches <= 0) return null;

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>Batch Progress</span>
        <span>
          {batchInfo.currentBatch} / {batchInfo.totalBatches}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-gray-200">
        <div
          className="h-1 rounded-full bg-green-600 transition-all duration-300"
          style={getBatchProgressStyle(batchInfo.currentBatch, batchInfo.totalBatches)}
        />
      </div>
    </div>
  );
};

const EstimatedTime = ({
  timeRemaining,
  formatTime,
}: {
  timeRemaining?: number;
  formatTime: (seconds: number) => string;
}) => {
  if (timeRemaining == null || (typeof timeRemaining === "number" && timeRemaining === 0)) return null;

  return <div className="text-sm text-gray-600">Estimated time remaining: {formatTime(timeRemaining)}</div>;
};

const GeocodingStats = ({ stats }: { stats?: Record<string, unknown> }) => {
  if (!stats || Object.keys(stats).length === 0) return null;

  return (
    <div className="border-t pt-3">
      <h4 className="mb-2 text-sm font-medium">Geocoding Statistics</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key}>
            <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}:</span> {String(value)}
          </div>
        ))}
      </div>
    </div>
  );
};

// Define the progress response type
type ProgressResponse = {
  importId: string;
  status: string;
  stage: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
    createdEvents: number;
  };
  stageProgress: {
    stage: string;
    percentage: number;
  };
  batchInfo: {
    currentBatch: number;
    totalBatches: number;
    batchSize: number;
  };
  estimatedTimeRemaining?: number;
  geocodingStats?: Record<string, unknown>;
};

const ProgressSection = ({
  progress,
  formatTime,
}: {
  progress: ProgressResponse | null | undefined;
  formatTime: (seconds: number) => string;
}) => {
  if (!progress) return null;

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
        {getStatusIcon(progress.status)}
        Import Progress
      </h3>
      <p className="mb-4 text-gray-600">Import ID: {progress.importId}</p>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>{progress.stageProgress.stage}</span>
            <span>{Math.round(progress.stageProgress.percentage)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
              style={getProgressBarStyle(progress.stageProgress.percentage)}
            />
          </div>
        </div>

        <ProgressStats progress={progress} />
        <BatchProgress batchInfo={progress.batchInfo} />
        <EstimatedTime timeRemaining={progress.estimatedTimeRemaining} formatTime={formatTime} />
        <GeocodingStats stats={progress.geocodingStats} />
      </div>
    </div>
  );
};

export const ImportUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [importId, setImportId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React Query hooks
  const uploadMutation = useImportUploadMutation();
  const { data: progress } = useImportProgressQuery(importId);

  // Get upload state from mutation
  const uploading = uploadMutation.isPending;
  const error = uploadMutation.error?.message ?? null;

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        setFile(selectedFile);
        uploadMutation.reset(); // Clear any previous errors
      }
    },
    [uploadMutation],
  );

  const performUpload = useCallback(async () => {
    if (!file || !catalogId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("catalogId", catalogId);
    formData.append("sessionId", `session_${Date.now()}`);

    return new Promise<void>((resolve, reject) => {
      uploadMutation.mutate(
        { formData },
        {
          onSuccess: (result) => {
            setImportId(result.importId);
            setSuccess("File uploaded successfully! Processing started...");
            resolve();
          },
          onError: (error) => {
            reject(error);
          },
        },
      );
    });
  }, [file, catalogId, uploadMutation]);

  const handleUpload = useCallback(async () => {
    if (!file || !catalogId) {
      return;
    }

    setSuccess(null);
    await performUpload();
  }, [file, catalogId, performUpload]);

  const handleUploadVoid = useCallback(() => {
    void handleUpload();
  }, [handleUpload]);

  const resetForm = useCallback(() => {
    setFile(null);
    setCatalogId("");
    setImportId(null);
    setSuccess(null);
    uploadMutation.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadMutation]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }, []);

  const isFormDisabled = uploading || (importId != null && typeof importId === "string" && importId.trim() !== "");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold">📤 Event Data Import</h2>
        <p className="mb-6 text-gray-600">
          Upload CSV or Excel files to import event data. Files will be processed and geocoded automatically.
        </p>

        <ErrorAlert error={error} />
        <SuccessAlert success={success} />

        <div className="space-y-4">
          <CatalogInput catalogId={catalogId} onCatalogChange={setCatalogId} disabled={isFormDisabled} />

          <FileInput
            file={file}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            disabled={isFormDisabled}
          />

          <UploadButtons
            file={file}
            catalogId={catalogId}
            uploading={uploading}
            importId={importId}
            onUpload={handleUploadVoid}
            onReset={resetForm}
          />
        </div>
      </div>

      <ProgressSection progress={progress} formatTime={formatTime} />
    </div>
  );
};
