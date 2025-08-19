/**
 * File upload component for importing CSV and Excel data.
 *
 * Provides a drag-and-drop interface for uploading event data files with
 * real-time progress tracking, schema detection, and approval workflow.
 * Supports CSV and Excel formats with automatic parsing and validation.
 *
 * @module
 * @category Components
 */
"use client";

import { useCallback, useRef, useState } from "react";

import {
  type ImportProgressResponse,
  useImportProgressQuery,
  useImportUploadMutation,
} from "../lib/hooks/use-events-queries";

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
    [onCatalogChange]
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

const ProgressStats = ({ progress }: { progress: ImportProgressResponse }) => {
  // Calculate totals from jobs
  const totalRows = progress.jobs.reduce((sum, job) => sum + job.rowsTotal, 0);
  const processedRows = progress.jobs.reduce((sum, job) => sum + job.rowsProcessed, 0);
  const totalErrors = progress.jobs.reduce((sum, job) => sum + job.errors, 0);

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <span className="font-medium">Status:</span> {progress.status}
      </div>
      <div>
        <span className="font-medium">Datasets:</span> {progress.datasetsProcessed} / {progress.datasetsCount}
      </div>
      <div>
        <span className="font-medium">Rows Processed:</span> {processedRows} / {totalRows}
      </div>
      <div>
        <span className="font-medium">Overall Progress:</span> {progress.overallProgress}%
      </div>
      {totalErrors > 0 && (
        <div className="col-span-2">
          <span className="font-medium text-red-600">Errors:</span> {totalErrors}
        </div>
      )}
    </div>
  );
};

const JobsProgress = ({ jobs }: { jobs: ImportProgressResponse["jobs"] }) => {
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Dataset Progress</h4>
      {jobs.map((job) => (
        <div key={job.id} className="rounded border p-2">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium">{job.datasetName ?? job.datasetId}</span>
            <span>{job.stage}</span>
          </div>
          <div className="mb-1 flex justify-between text-xs">
            <span>Progress: {job.progress}%</span>
            <span>
              {job.rowsProcessed} / {job.rowsTotal} rows
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-gray-200">
            <div
              className="h-1 rounded-full bg-green-600 transition-all duration-300"
              style={getProgressBarStyle(job.progress)}
            />
          </div>
          {job.errors > 0 && <div className="mt-1 text-xs text-red-600">Errors: {job.errors}</div>}
        </div>
      ))}
    </div>
  );
};

const ProgressSection = ({ progress }: { progress: ImportProgressResponse | null | undefined }) => {
  if (!progress) return null;

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
        {getStatusIcon(progress.status)}
        Import Progress
      </h3>
      <p className="mb-4 text-gray-600">File: {progress.originalName}</p>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{progress.overallProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
              style={getProgressBarStyle(progress.overallProgress)}
            />
          </div>
        </div>

        <ProgressStats progress={progress} />
        <JobsProgress jobs={progress.jobs} />
        {progress.errorLog && (
          <div className="rounded border border-red-200 bg-red-50 p-3">
            <h4 className="mb-1 text-sm font-medium text-red-800">Error Details</h4>
            <p className="text-xs text-red-700">{progress.errorLog}</p>
          </div>
        )}
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
    [uploadMutation]
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
        }
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

      <ProgressSection progress={progress} />
    </div>
  );
};
