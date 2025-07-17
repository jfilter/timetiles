"use client";

import { useTheme } from "next-themes";
import { Histogram, type HistogramBin } from "@workspace/ui/components/charts";
import {
  defaultLightTheme,
  defaultDarkTheme,
} from "@workspace/ui/components/charts";
import type { Event } from "../payload-types";
import { useEventDateAccessor } from "../hooks/useEventStats";
import { useQueryState } from "nuqs";

interface EventHistogramProps {
  events: Event[];
  loading?: boolean;
  height?: number | string;
  className?: string;
}

export function EventHistogram({
  events,
  loading = false,
  height = 200,
  className,
}: EventHistogramProps) {
  const { theme } = useTheme();
  const dateAccessor = useEventDateAccessor();
  const [, setStartDate] = useQueryState("startDate");
  const [, setEndDate] = useQueryState("endDate");

  const handleBarClick = (bin: HistogramBin<Event>) => {
    const [start, end] = bin.range;

    // Format dates as YYYY-MM-DD for date inputs
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    setStartDate(formatDate(startDate));
    setEndDate(formatDate(new Date(endDate.getTime() - 1))); // Subtract 1ms to get end of previous day
  };

  // Filter events that have dates
  const eventsWithDates = events.filter((event) => event.eventTimestamp);

  return (
    <Histogram
      data={eventsWithDates}
      xAccessor={dateAccessor}
      binning="auto"
      height={height}
      className={className}
      loading={loading}
      theme={theme === "dark" ? defaultDarkTheme : defaultLightTheme}
      color={theme === "dark" ? "#60a5fa" : "#3b82f6"}
      onBarClick={handleBarClick}
      xLabel=""
      yLabel="Events"
      formatter={{
        tooltip: (bin) => {
          const [start, end] = bin.range;
          const dateFormat: Intl.DateTimeFormatOptions = {
            month: "short",
            day: "numeric",
            year: "numeric",
          };

          const startDate = start instanceof Date ? start : new Date(start);
          const endDate = end instanceof Date ? end : new Date(end);
          const startStr = startDate.toLocaleDateString(undefined, dateFormat);
          const endStr = new Date(endDate.getTime() - 1).toLocaleDateString(
            undefined,
            dateFormat,
          );

          return `
            <div style="padding: 8px;">
              <strong>${startStr} - ${endStr}</strong><br/>
              Events: <strong>${bin.count}</strong>
            </div>
          `;
        },
      }}
    />
  );
}
