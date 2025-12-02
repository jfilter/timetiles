/**
 * Client component for listing and managing scheduled imports.
 *
 * Displays schedules in a card list with status indicators and actions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import {
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  GlobeIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { ScheduledImport } from "@/payload-types";

// Helper to get toggle button icon based on loading state
const getToggleButtonIcon = (loadingState: string | undefined, enabled: boolean) => {
  if (loadingState === "toggling") {
    return <Loader2Icon className="h-4 w-4 animate-spin" />;
  }
  if (enabled) {
    return <PauseCircleIcon className="h-4 w-4" />;
  }
  return <PlayIcon className="h-4 w-4" />;
};

interface SchedulesListClientProps {
  initialSchedules: ScheduledImport[];
}

const FREQUENCY_LABELS: Record<string, string> = {
  hourly: "Every hour",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const SCHEMA_MODE_LABELS: Record<string, string> = {
  strict: "Strict",
  additive: "Additive",
  flexible: "Flexible",
};

// Format date for display
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
};

// Get status badge
const getStatusBadge = (schedule: ScheduledImport) => {
  if (!schedule.enabled) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <PauseCircleIcon className="h-3 w-3" />
        Disabled
      </span>
    );
  }

  if (schedule.lastStatus === "failed") {
    return (
      <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <XCircleIcon className="h-3 w-3" />
        Failed
      </span>
    );
  }

  return (
    <span className="bg-cartographic-forest/10 text-cartographic-forest inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <CheckCircle2Icon className="h-3 w-3" />
      Active
    </span>
  );
};

interface ScheduleCardProps {
  schedule: ScheduledImport;
  loadingState?: string;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
}

const ScheduleCard = ({ schedule, loadingState, onToggle, onRun, onDelete }: ScheduleCardProps) => {
  const isLoading = Boolean(loadingState);

  return (
    <Card className={cn("transition-opacity", !schedule.enabled && "opacity-60", isLoading && "pointer-events-none")}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Main info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-cartographic-charcoal truncate font-serif text-lg font-semibold">{schedule.name}</h3>
              {getStatusBadge(schedule)}
            </div>

            {/* URL */}
            <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <GlobeIcon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate font-mono text-xs">{schedule.sourceUrl}</span>
            </div>

            {/* Schedule info */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="text-muted-foreground h-4 w-4" />
                <span>
                  {schedule.scheduleType === "frequency"
                    ? FREQUENCY_LABELS[schedule.frequency ?? "daily"]
                    : schedule.cronExpression}
                </span>
              </div>

              {schedule.schemaMode && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <span>Schema:</span>
                  <span className="font-medium">{SCHEMA_MODE_LABELS[schedule.schemaMode]}</span>
                </div>
              )}
            </div>

            {/* Execution info */}
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-xs">
              {schedule.lastRun && <span>Last run: {formatDate(schedule.lastRun)}</span>}
              {schedule.nextRun && schedule.enabled && <span>Next run: {formatDate(schedule.nextRun)}</span>}
              {schedule.lastError && (
                <span className="text-destructive truncate" title={schedule.lastError}>
                  Error: {schedule.lastError.substring(0, 50)}...
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggle}
              disabled={isLoading}
              title={schedule.enabled ? "Disable schedule" : "Enable schedule"}
            >
              {getToggleButtonIcon(loadingState, schedule.enabled ?? false)}
            </Button>

            <Button variant="outline" size="sm" onClick={onRun} disabled={isLoading} title="Run now">
              {loadingState === "running" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isLoading}
              title="Delete schedule"
              className="text-destructive hover:bg-destructive/10"
            >
              {loadingState === "deleting" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SchedulesListClient = ({ initialSchedules }: SchedulesListClientProps) => {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [loadingStates, setLoadingStates] = useState<Record<number, string>>({});

  // Toggle schedule enabled/disabled
  const handleToggleEnabled = useCallback(async (id: number, currentEnabled: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [id]: "toggling" }));

    try {
      const response = await fetch(`/api/scheduled-imports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !currentEnabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update schedule");
      }

      const updated = await response.json();
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: updated.doc.enabled } : s)));
    } finally {
      setLoadingStates((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    }
  }, []);

  // Trigger manual run
  const handleManualRun = useCallback(async (id: number) => {
    setLoadingStates((prev) => ({ ...prev, [id]: "running" }));

    try {
      const response = await fetch(`/api/scheduled-imports/${id}/trigger`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to trigger import");
      }

      // Refresh schedule to get updated lastRun
      const refreshResponse = await fetch(`/api/scheduled-imports/${id}`, {
        credentials: "include",
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setSchedules((prev) => prev.map((s) => (s.id === id ? data : s)));
      }
    } finally {
      setLoadingStates((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    }
  }, []);

  // Delete schedule
  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this scheduled import?")) {
      return;
    }

    setLoadingStates((prev) => ({ ...prev, [id]: "deleting" }));

    try {
      const response = await fetch(`/api/scheduled-imports/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete schedule");
      }

      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setLoadingStates((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    }
  }, []);

  // Create stable callbacks map for each schedule to avoid inline functions
  const scheduleCallbacks = useMemo(() => {
    return schedules.reduce(
      (acc, schedule) => {
        acc[schedule.id] = {
          onToggle: () => void handleToggleEnabled(schedule.id, schedule.enabled ?? false),
          onRun: () => void handleManualRun(schedule.id),
          onDelete: () => void handleDelete(schedule.id),
        };
        return acc;
      },
      {} as Record<number, { onToggle: () => void; onRun: () => void; onDelete: () => void }>
    );
  }, [schedules, handleToggleEnabled, handleManualRun, handleDelete]);

  if (schedules.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClockIcon className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">No scheduled imports</h3>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            Create a scheduled import by importing data from a URL in the import wizard.
          </p>
          <Button asChild className="mt-4">
            <Link href="/import">Import Data</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {schedules.map((schedule) => {
        const callbacks = scheduleCallbacks[schedule.id];
        if (!callbacks) return null;
        return (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            loadingState={loadingStates[schedule.id]}
            onToggle={callbacks.onToggle}
            onRun={callbacks.onRun}
            onDelete={callbacks.onDelete}
          />
        );
      })}
    </div>
  );
};
