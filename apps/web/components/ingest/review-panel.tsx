/**
 * Review panel shown when an import job reaches NEEDS_REVIEW.
 *
 * Renders per-reason UI with contextual details and actions:
 * - Column picker for no-timestamp / no-location
 * - Stats display for high-duplicates / high-empty-rows / high-row-errors
 * - Approval and cancel buttons
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, Label } from "@timetiles/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertTriangleIcon, CalendarOffIcon, CheckIcon, MapPinOffIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { REVIEW_REASONS } from "@/lib/constants/review-reasons";
import { type ApproveIngestJobRequest, useApproveIngestJobMutation } from "@/lib/hooks/use-ingest-approval";
import type { FormattedJobProgress } from "@/lib/ingest/types/progress-tracking";

export interface ReviewPanelProps {
  job: FormattedJobProgress;
  className?: string;
}

interface ReasonConfig {
  icon: typeof AlertTriangleIcon;
  approveLabel: string;
  approveWithoutLabel?: string;
}

/** Build reason config with translated labels. Keyed by REVIEW_REASONS values. */
const getReasonConfig = (t: ReturnType<typeof useTranslations>): Record<string, ReasonConfig> => ({
  [REVIEW_REASONS.NO_TIMESTAMP_DETECTED]: {
    icon: CalendarOffIcon,
    approveLabel: t("approveUseColumn"),
    approveWithoutLabel: t("approveContinueWithoutDates"),
  },
  [REVIEW_REASONS.NO_LOCATION_DETECTED]: {
    icon: MapPinOffIcon,
    approveLabel: t("approveUseColumn"),
    approveWithoutLabel: t("approveContinueWithoutLocations"),
  },
  [REVIEW_REASONS.AMBIGUOUS_COORDINATE_ORDER]: {
    icon: MapPinOffIcon,
    approveLabel: t("approveUseOrder"),
    // The without-order button here does NOT drop coordinates — it flips the
    // dataset to best-effort (per-row guessing), so the label must say so.
    approveWithoutLabel: t("approveContinueBestEffortCoordinates"),
  },
  [REVIEW_REASONS.AMBIGUOUS_DATE_ORDER]: {
    icon: CalendarOffIcon,
    approveLabel: t("approveUseOrder"),
    // The without-order button here does NOT drop dates — it flips the dataset to
    // best-effort (per-row day/month guessing), so the label must say so.
    approveWithoutLabel: t("approveContinueBestEffortDates"),
  },
  [REVIEW_REASONS.HIGH_DUPLICATE_RATE]: { icon: AlertTriangleIcon, approveLabel: t("approveImportAnyway") },
  [REVIEW_REASONS.HIGH_EMPTY_ROW_RATE]: { icon: AlertTriangleIcon, approveLabel: t("approveImportAnyway") },
  [REVIEW_REASONS.HIGH_ROW_ERROR_RATE]: { icon: AlertTriangleIcon, approveLabel: t("approveAcceptPartial") },
  [REVIEW_REASONS.GEOCODING_PARTIAL]: { icon: AlertTriangleIcon, approveLabel: t("approveContinuePartialGeocoding") },
  [REVIEW_REASONS.QUOTA_EXCEEDED]: { icon: AlertTriangleIcon, approveLabel: t("approveContactAdmin") },
  [REVIEW_REASONS.SCHEMA_DRIFT]: { icon: AlertTriangleIcon, approveLabel: t("approveSchemaChanges") },
});

/** Axis-order options for the ambiguous combined-coordinate picker. */
// eslint-disable-next-line i18next/no-literal-string -- canonical format tokens, not display copy
const COORDINATE_ORDER_OPTIONS = ["lat,lng", "lng,lat"];

/** Day/month order options for the ambiguous date-order picker. */
// eslint-disable-next-line i18next/no-literal-string -- canonical format tokens, not display copy
const DATE_ORDER_OPTIONS = ["D/M", "M/D"];

/**
 * The AMBIGUOUS_DATE_ORDER reason is reused for both the start and the end date
 * column. The schema-detection gate stores the detected path under
 * `reviewDetails.endTimestampPath` for the end column (and under `timestampPath`
 * for the start column), so the presence of `endTimestampPath` (with no
 * `timestampPath`) is the discriminator that routes the pick to the end role.
 */
const isEndDateOrderReview = (reason: string, details: Record<string, unknown> | null): boolean =>
  reason === REVIEW_REASONS.AMBIGUOUS_DATE_ORDER &&
  Boolean(details?.endTimestampPath) &&
  details?.timestampPath == null;

/** Build the approve request for a column/order pick. Kept outside the component to bound its complexity. */
const buildApproveRequest = (
  ingestJobId: string,
  reason: string,
  selectedColumn: string,
  coordinateOrder: string,
  dateOrder: string,
  isEndDate: boolean
): ApproveIngestJobRequest => {
  const request: ApproveIngestJobRequest = { ingestJobId };
  if (reason === REVIEW_REASONS.NO_TIMESTAMP_DETECTED && selectedColumn) {
    request.timestampPath = selectedColumn;
  } else if (reason === REVIEW_REASONS.NO_LOCATION_DETECTED && selectedColumn) {
    request.locationPath = selectedColumn;
    request.locationNamePath = selectedColumn;
  } else if (
    reason === REVIEW_REASONS.AMBIGUOUS_COORDINATE_ORDER &&
    (coordinateOrder === "lat,lng" || coordinateOrder === "lng,lat")
  ) {
    request.coordinateFormat = coordinateOrder;
  } else if (reason === REVIEW_REASONS.AMBIGUOUS_DATE_ORDER && (dateOrder === "D/M" || dateOrder === "M/D")) {
    // Same picker, different role: end-date picks target endTimestampOrder.
    if (isEndDate) {
      request.endTimestampOrder = dateOrder;
    } else {
      request.timestampOrder = dateOrder;
    }
  }
  return request;
};

/** Column picker for no-timestamp / no-location reviews. */
const ColumnPicker = ({
  columns,
  label,
  placeholder,
  value,
  onChange,
}: {
  columns: string[];
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {columns.map((col) => (
          <SelectItem key={col} value={col}>
            {col}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/** Stats row for threshold-based reviews. */
const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-muted-foreground text-sm">{label}</span>
    <span className="text-foreground font-mono text-sm font-medium">{value}</span>
  </div>
);

/** Format a percentage from a 0-1 rate value. */
const formatRate = (rate: unknown): string => `${Math.round(((rate as number) ?? 0) * 100)}%`;

/** Stats wrapper with consistent styling. */
const StatsContainer = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-background divide-border divide-y rounded-sm border px-4">{children}</div>
);

/** Reason-specific stats display. */
const ReasonStats = ({
  reason,
  details,
  t,
}: {
  reason: string;
  details: Record<string, unknown>;
  t: ReturnType<typeof useTranslations>;
}) => {
  switch (reason) {
    case REVIEW_REASONS.HIGH_DUPLICATE_RATE:
      return (
        <StatsContainer>
          <StatRow label={t("totalRows")} value={String(Number(details.totalRows ?? 0))} />
          <StatRow label={t("uniqueRows")} value={String(Number(details.uniqueRows ?? 0))} />
          <StatRow label={t("duplicateRate")} value={formatRate(details.duplicateRate)} />
        </StatsContainer>
      );
    case REVIEW_REASONS.HIGH_EMPTY_ROW_RATE:
      return (
        <StatsContainer>
          <StatRow label={t("totalRows")} value={String(Number(details.totalRows ?? 0))} />
          <StatRow label={t("emptyRows")} value={String(Number(details.emptyRows ?? 0))} />
          <StatRow label={t("emptyRate")} value={formatRate(details.emptyRate)} />
        </StatsContainer>
      );
    case REVIEW_REASONS.HIGH_ROW_ERROR_RATE:
      return (
        <StatsContainer>
          <StatRow label={t("eventsCreated")} value={String(Number(details.totalEvents ?? 0))} />
          <StatRow label={t("rowErrors")} value={String(Number(details.errorCount ?? 0))} />
          <StatRow label={t("errorRate")} value={formatRate(details.errorRate)} />
        </StatsContainer>
      );
    case REVIEW_REASONS.GEOCODING_PARTIAL:
      return (
        <StatsContainer>
          <StatRow label={t("geocoded")} value={String(Number(details.geocoded ?? 0))} />
          <StatRow label={t("geocodeFailed")} value={String(Number(details.failed ?? 0))} />
          <StatRow label={t("failRate")} value={formatRate(details.failRate)} />
        </StatsContainer>
      );
    case REVIEW_REASONS.QUOTA_EXCEEDED:
      return (
        <StatsContainer>
          <StatRow label={t("currentEvents")} value={String(Number(details.current ?? 0))} />
          <StatRow label={t("eventLimit")} value={String(Number(details.limit ?? 0))} />
          <StatRow label={t("wouldCreate")} value={String(Number(details.estimatedNew ?? 0))} />
        </StatsContainer>
      );
    default:
      return null;
  }
};

/** Renders the column picker (no-timestamp/no-location) or the axis-order picker (ambiguous coords/dates). */
const ReviewPicker = ({
  reason,
  details,
  availableColumns,
  selectedColumn,
  setSelectedColumn,
  coordinateOrder,
  setCoordinateOrder,
  dateOrder,
  setDateOrder,
  isEndDate,
  t,
}: {
  reason: string;
  details: Record<string, unknown> | null;
  availableColumns: string[];
  selectedColumn: string;
  setSelectedColumn: (v: string) => void;
  coordinateOrder: string;
  setCoordinateOrder: (v: string) => void;
  dateOrder: string;
  setDateOrder: (v: string) => void;
  isEndDate: boolean;
  t: ReturnType<typeof useTranslations>;
}) => {
  if (
    (reason === REVIEW_REASONS.NO_TIMESTAMP_DETECTED || reason === REVIEW_REASONS.NO_LOCATION_DETECTED) &&
    availableColumns.length > 0
  ) {
    return (
      <div className="bg-background rounded-sm border p-4">
        <ColumnPicker
          columns={availableColumns}
          label={
            reason === REVIEW_REASONS.NO_TIMESTAMP_DETECTED ? t("selectTimestampColumn") : t("selectLocationColumn")
          }
          placeholder={t("selectColumnPlaceholder")}
          value={selectedColumn}
          onChange={setSelectedColumn}
        />
      </div>
    );
  }

  if (reason === REVIEW_REASONS.AMBIGUOUS_COORDINATE_ORDER) {
    return (
      <div className="bg-background rounded-sm border p-4">
        <ColumnPicker
          columns={COORDINATE_ORDER_OPTIONS}
          label={
            typeof details?.sampleValue === "string"
              ? t("selectCoordinateOrderWithSample", { sample: details.sampleValue })
              : t("selectCoordinateOrder")
          }
          placeholder={t("selectCoordinateOrderPlaceholder")}
          value={coordinateOrder}
          onChange={setCoordinateOrder}
        />
      </div>
    );
  }

  if (reason === REVIEW_REASONS.AMBIGUOUS_DATE_ORDER) {
    const hasSample = typeof details?.sampleValue === "string";
    let label: string;
    if (isEndDate) {
      label = hasSample
        ? t("selectEndDateOrderWithSample", { sample: details.sampleValue as string })
        : t("selectEndDateOrder");
    } else {
      label = hasSample
        ? t("selectDateOrderWithSample", { sample: details.sampleValue as string })
        : t("selectDateOrder");
    }
    return (
      <div className="bg-background rounded-sm border p-4">
        <ColumnPicker
          columns={DATE_ORDER_OPTIONS}
          label={label}
          placeholder={t("selectDateOrderPlaceholder")}
          value={dateOrder}
          onChange={setDateOrder}
        />
      </div>
    );
  }

  return null;
};

/** Action buttons for the review panel. */
const ReviewActions = ({
  reason,
  config,
  canApproveWithColumn,
  isPending,
  onApprove,
  onApproveWithout,
  onApproveBestEffort,
}: {
  reason: string;
  config: ReasonConfig;
  canApproveWithColumn: boolean;
  isPending: boolean;
  onApprove: () => void;
  onApproveWithout: () => void;
  onApproveBestEffort: () => void;
}) => {
  // Ambiguous-ORDER reasons: the without-button flips the dataset to best-effort
  // (sticky per-row guessing). No-timestamp/no-location: the without-button
  // genuinely imports with no date / no location (plain approve, no override).
  const isOrderReason =
    reason === REVIEW_REASONS.AMBIGUOUS_COORDINATE_ORDER || reason === REVIEW_REASONS.AMBIGUOUS_DATE_ORDER;
  const isFieldPickerReason =
    reason === REVIEW_REASONS.NO_TIMESTAMP_DETECTED || reason === REVIEW_REASONS.NO_LOCATION_DETECTED || isOrderReason;

  if (isFieldPickerReason) {
    const onWithout = isOrderReason ? onApproveBestEffort : onApproveWithout;
    return (
      <>
        <Button size="sm" onClick={onApprove} disabled={!canApproveWithColumn || isPending}>
          <CheckIcon className="mr-1.5 h-4 w-4" />
          {config.approveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onWithout} disabled={isPending}>
          {config.approveWithoutLabel}
        </Button>
      </>
    );
  }

  if (reason === REVIEW_REASONS.QUOTA_EXCEEDED) {
    return (
      <Button size="sm" variant="outline" disabled>
        <XIcon className="mr-1.5 h-4 w-4" />
        {config.approveLabel}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={onApproveWithout} disabled={isPending}>
      <CheckIcon className="mr-1.5 h-4 w-4" />
      {config.approveLabel}
    </Button>
  );
};

export const ReviewPanel = ({ job, className }: Readonly<ReviewPanelProps>) => {
  const t = useTranslations("Ingest");
  const reason = job.reviewReason;
  const details = job.reviewDetails as Record<string, unknown> | null;
  const reasonConfig = getReasonConfig(t);
  const config = reason ? reasonConfig[reason] : null;
  const Icon = config?.icon ?? AlertTriangleIcon;

  const [selectedColumn, setSelectedColumn] = useState("");
  const [coordinateOrder, setCoordinateOrder] = useState("");
  const [dateOrder, setDateOrder] = useState("");
  const approveMutation = useApproveIngestJobMutation();

  if (!reason || !config) return null;

  const availableColumns = (details?.availableColumns as string[]) ?? [];
  const isColumnPickerReason =
    reason === REVIEW_REASONS.NO_TIMESTAMP_DETECTED || reason === REVIEW_REASONS.NO_LOCATION_DETECTED;
  const isOrderPickerReason = reason === REVIEW_REASONS.AMBIGUOUS_COORDINATE_ORDER;
  const isDateOrderPickerReason = reason === REVIEW_REASONS.AMBIGUOUS_DATE_ORDER;
  const isEndDate = isEndDateOrderReview(reason, details);
  // A pick is ready when the relevant reason has its selection made.
  const canApproveWithColumn = Boolean(
    (isColumnPickerReason && selectedColumn) ||
    (isOrderPickerReason && coordinateOrder) ||
    (isDateOrderPickerReason && dateOrder)
  );

  const handleApprove = () => {
    approveMutation.mutate(
      buildApproveRequest(String(job.id), reason, selectedColumn, coordinateOrder, dateOrder, isEndDate)
    );
  };

  const handleApproveWithout = () => {
    approveMutation.mutate({ ingestJobId: String(job.id) });
  };

  // For ambiguous-order reasons, "continue without picking an order" means: keep
  // importing but let the dataset guess per row. Flip the sticky policy to
  // best-effort so the guessing is explicit and persistent (ADR 0040) rather than
  // an accidental side effect of the per-import skip flag.
  const handleApproveBestEffort = () => {
    approveMutation.mutate({ ingestJobId: String(job.id), ambiguityResolution: "best-effort" });
  };

  return (
    <Card className={cn("border-secondary/30 bg-secondary/5 border", className)}>
      <CardContent className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="bg-secondary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <Icon className="text-secondary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-foreground font-serif text-lg font-semibold">{t("reviewRequired")}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {(details?.message as string) ?? t("reviewRequiredDescription")}
            </p>
          </div>
        </div>

        {/* Column picker (no-timestamp/no-location) or axis-order picker (ambiguous coords) */}
        <ReviewPicker
          reason={reason}
          details={details}
          availableColumns={availableColumns}
          selectedColumn={selectedColumn}
          setSelectedColumn={setSelectedColumn}
          coordinateOrder={coordinateOrder}
          setCoordinateOrder={setCoordinateOrder}
          dateOrder={dateOrder}
          setDateOrder={setDateOrder}
          isEndDate={isEndDate}
          t={t}
        />

        {/* Reason-specific stats */}
        {details && <ReasonStats reason={reason} details={details} t={t} />}

        {/* Error message from mutation */}
        {approveMutation.isError && (
          <div className="bg-destructive/10 text-destructive rounded-sm p-3 text-sm">
            {approveMutation.error instanceof Error ? approveMutation.error.message : t("approvalFailed")}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <ReviewActions
            reason={reason}
            config={config}
            canApproveWithColumn={canApproveWithColumn}
            isPending={approveMutation.isPending}
            onApprove={handleApprove}
            onApproveWithout={handleApproveWithout}
            onApproveBestEffort={handleApproveBestEffort}
          />
        </div>
      </CardContent>
    </Card>
  );
};
