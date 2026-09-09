/**
 * Compact time labels for the import progress timeline.
 * @module
 * @category Services
 */
const formatMinutes = (seconds: number): string => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
};

export const formatStageDuration = (startedAt: string | null, completedAt: string | null): string | null => {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (Number((ms / 1000).toFixed(1)) < 60) return `${(ms / 1000).toFixed(1)}s`;
  return formatMinutes(ms / 1000);
};

export const formatTimeRemaining = (seconds: number | null): string | null => {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.round(seconds);
  return rounded < 60 ? `~${rounded}s` : `~${formatMinutes(rounded)}`;
};
