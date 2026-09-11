/**
 * Shared normalization of errors stored by ingest jobs and schedules.
 *
 * @module
 * @category Services
 */
import { isRecord } from "@/lib/utils/is-record";

export const MAX_INGEST_ERROR_MESSAGE_LENGTH = 500;

const getStringProperty = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const property = value[key];
  return typeof property === "string" && property.trim() !== "" ? property.trim() : undefined;
};

const truncateErrorMessage = (message: string): string =>
  message.length > MAX_INGEST_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_INGEST_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;

const formatCauseDetails = (cause: unknown): string[] => {
  const details: string[] = [];
  const code = getStringProperty(cause, "code");
  const detail = getStringProperty(cause, "detail");
  const constraint = getStringProperty(cause, "constraint");
  const table = getStringProperty(cause, "table");
  const column = getStringProperty(cause, "column");

  if (code) details.push(`code ${code}`);
  if (detail) details.push(`detail: ${detail}`);
  if (constraint) details.push(`constraint: ${constraint}`);
  if (table) details.push(`table: ${table}`);
  if (column) details.push(`column: ${column}`);

  return details;
};

/** Convert DB/row errors into short, non-empty messages safe for ingest job storage. */
export const normalizeIngestErrorMessage = (error: unknown, fallback = "Unknown error"): string => {
  const cause = isRecord(error) ? error.cause : undefined;
  const causeMessage = getStringProperty(cause, "message");
  if (causeMessage) {
    const details = formatCauseDetails(cause);
    const message = details.length > 0 ? `${causeMessage} (${details.join("; ")})` : causeMessage;
    return truncateErrorMessage(message);
  }

  let message = "";
  if (error instanceof Error) {
    message = error.message.trim();
  } else if (typeof error === "string") {
    message = error.trim();
  }
  if (!message) return fallback;

  // Drizzle wraps database failures with the full generated SQL and params in
  // `error.message`. Store/log the structured error for operators, but keep
  // row-level import errors concise and free of giant SQL strings.
  if (message.startsWith("Failed query:")) {
    return fallback;
  }

  return truncateErrorMessage(message);
};
