"use client";

import { useState, useRef } from "react";
import type { Import } from "../payload-types";

// Use Payload types more directly for better type safety
interface ImportProgress {
  importId: string;
  status: Import['status'];
  stage: Import['processingStage'];
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
  geocodingStats: Import['geocodingStats'];
  currentJob?: {
    id: string;
    status: string;
    progress: number;
  };
  estimatedTimeRemaining?: number;
}

export default function ImportUpload(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !catalogId) {
      setError("Please select a file and enter a catalog ID");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", catalogId);
      formData.append("sessionId", `session_${Date.now()}`);

      const response = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Upload failed");
      }

      setImportId(result.importId);
      setSuccess("File uploaded successfully! Processing started...");

      // Start polling for progress
      startProgressPolling(result.importId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startProgressPolling = (id: string) => {
    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/import/${id}/progress`);
        if (response.ok) {
          const progressData = await response.json();
          setProgress(progressData);

          // Stop polling if completed or failed
          if (
            progressData.status === "completed" ||
            progressData.status === "failed"
          ) {
            if (progressInterval.current) {
              clearInterval(progressInterval.current);
              progressInterval.current = null;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch progress:", err);
      }
    };

    // Poll immediately and then every 2 seconds
    pollProgress();
    progressInterval.current = setInterval(pollProgress, 2000);
  };

  const resetForm = () => {
    setFile(null);
    setCatalogId("");
    setImportId(null);
    setProgress(null);
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold">
          📤 Event Data Import
        </h2>
        <p className="mb-6 text-gray-600">
          Upload CSV or Excel files to import event data. Files will be
          processed and geocoded automatically.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="flex items-center">
              <span className="mr-2 text-red-600">⚠️</span>
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4">
            <div className="flex items-center">
              <span className="mr-2 text-green-600">✅</span>
              <span className="text-green-800">{success}</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="catalogId"
              className="mb-2 block text-sm font-medium"
            >
              Catalog ID
            </label>
            <input
              id="catalogId"
              type="text"
              placeholder="Enter catalog ID"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              disabled={uploading || !!importId}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label htmlFor="file" className="mb-2 block text-sm font-medium">
              Select File
            </label>
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              disabled={uploading || !!importId}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            {file && (
              <p className="mt-1 text-sm text-gray-600">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={!file || !catalogId || uploading || !!importId}
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

            {importId && (
              <button
                onClick={resetForm}
                className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
              >
                Start New Import
              </button>
            )}
          </div>
        </div>
      </div>

      {progress && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
            {progress.status === "completed"
              ? "✅"
              : progress.status === "failed"
                ? "❌"
                : progress.status === "processing"
                  ? "⏳"
                  : "📄"}
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
                  style={{ width: `${progress.stageProgress.percentage}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Status:</span> {progress.status}
              </div>
              <div>
                <span className="font-medium">Stage:</span> {progress.stage}
              </div>
              <div>
                <span className="font-medium">Processed:</span>{" "}
                {progress.progress.current} / {progress.progress.total}
              </div>
              <div>
                <span className="font-medium">Overall:</span>{" "}
                {progress.progress.percentage}%
              </div>
            </div>

            {progress.batchInfo.totalBatches > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>Batch Progress</span>
                  <span>
                    {progress.batchInfo.currentBatch} /{" "}
                    {progress.batchInfo.totalBatches}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-gray-200">
                  <div
                    className="h-1 rounded-full bg-green-600 transition-all duration-300"
                    style={{
                      width: `${(progress.batchInfo.currentBatch / progress.batchInfo.totalBatches) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            {progress.estimatedTimeRemaining && (
              <div className="text-sm text-gray-600">
                Estimated time remaining:{" "}
                {formatTime(progress.estimatedTimeRemaining)}
              </div>
            )}

            {progress.geocodingStats &&
              Object.keys(progress.geocodingStats).length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="mb-2 text-sm font-medium">
                    Geocoding Statistics
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(progress.geocodingStats).map(
                      ([key, value]) => (
                        <div key={key}>
                          <span className="capitalize">
                            {key.replace(/([A-Z])/g, " $1")}:
                          </span>{" "}
                          {String(value)}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
