/**
 * Shared types for TimeScrape runner.
 *
 * @module
 * @category Types
 */

export interface RunRequest {
  run_id: string;
  runtime: "python" | "node";
  entrypoint: string;
  output_file?: string;
  code_url?: string;
  code?: Record<string, string>;
  env?: Record<string, string>;
  limits?: { timeout_secs?: number; memory_mb?: number };
}

export interface RunResult {
  status: "success" | "failed" | "timeout";
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  output?: { rows: number; bytes: number; download_url: string };
}
