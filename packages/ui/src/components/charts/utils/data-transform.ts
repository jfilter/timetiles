import type { HistogramBin, BinningStrategy } from "../types";

export function createHistogramBins<T>(
  data: T[],
  xAccessor: (item: T) => Date | string | number,
  binning: BinningStrategy | "auto" | number = "auto"
): HistogramBin<T>[] {
  if (data.length === 0) return [];

  const values = data.map(xAccessor);
  const dates = values.map((v) => (v instanceof Date ? v : new Date(v)));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const strategy = determineBinningStrategy(minDate, maxDate, binning);
  const bins = generateBins(minDate, maxDate, strategy);

  return bins.map(([start, end]) => {
    const items = data.filter((item) => {
      const value = xAccessor(item);
      const date = value instanceof Date ? value : new Date(value);
      return date >= start && date < end;
    });

    return {
      range: [start, end],
      count: items.length,
      items,
    };
  });
}

export function determineBinningStrategy(
  minDate: Date,
  maxDate: Date,
  binning: BinningStrategy | "auto" | number
): BinningStrategy | number {
  if (binning !== "auto") return binning;

  const daysDiff = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 7) return "day";
  if (daysDiff <= 30) return "day";
  if (daysDiff <= 180) return "week";
  if (daysDiff <= 730) return "month";
  return "year";
}

function generateBins(minDate: Date, maxDate: Date, strategy: BinningStrategy | number): [Date, Date][] {
  const bins: [Date, Date][] = [];
  let current = new Date(minDate);
  current.setHours(0, 0, 0, 0);

  if (typeof strategy === "number") {
    const totalMs = maxDate.getTime() - minDate.getTime();
    const binSizeMs = totalMs / strategy;

    for (let i = 0; i < strategy; i++) {
      const start = new Date(minDate.getTime() + i * binSizeMs);
      const end = new Date(minDate.getTime() + (i + 1) * binSizeMs);
      bins.push([start, end]);
    }
    return bins;
  }

  while (current < maxDate) {
    const next = new Date(current);

    switch (strategy) {
      case "day":
        next.setDate(next.getDate() + 1);
        break;
      case "week":
        next.setDate(next.getDate() + 7);
        break;
      case "month":
        next.setMonth(next.getMonth() + 1);
        break;
      case "year":
        next.setFullYear(next.getFullYear() + 1);
        break;
    }

    bins.push([new Date(current), new Date(next)]);
    current = next;
  }

  return bins;
}

export function formatDateForBin(date: Date, strategy: BinningStrategy | number): string {
  if (typeof strategy === "number") {
    return date.toLocaleDateString();
  }

  switch (strategy) {
    case "day":
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    case "week":
      return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    case "month":
      return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    case "year":
      return date.getFullYear().toString();
    default:
      return date.toLocaleDateString();
  }
}
