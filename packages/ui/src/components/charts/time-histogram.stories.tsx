/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { DATASET_COLORS } from "../../lib/chart-themes";
import {
  DAY_SECONDS,
  HOUR_SECONDS,
  MONTH_SECONDS,
  TimeHistogram,
  type TimeHistogramDataItem,
  type TimeHistogramSeries,
} from "./time-histogram";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

const buildDailyData = (startDate: string, counts: number[]): TimeHistogramDataItem[] => {
  const start = new Date(startDate).getTime();

  return counts.map((count, index) => {
    const bucketStart = new Date(start + index * DAY_IN_MS);
    const bucketEnd = new Date(bucketStart.getTime() + DAY_IN_MS);

    return { date: bucketStart, dateEnd: bucketEnd, count };
  });
};

const buildHourlyData = (startDate: string, counts: number[]): TimeHistogramDataItem[] => {
  const start = new Date(startDate).getTime();

  return counts.map((count, index) => {
    const bucketStart = new Date(start + index * HOUR_IN_MS);
    const bucketEnd = new Date(bucketStart.getTime() + HOUR_IN_MS);

    return { date: bucketStart, dateEnd: bucketEnd, count };
  });
};

const buildMonthlyData = (startYear: number, startMonth: number, counts: number[]): TimeHistogramDataItem[] =>
  counts.map((count, index) => {
    const bucketStart = new Date(Date.UTC(startYear, startMonth + index, 1));
    const bucketEnd = new Date(Date.UTC(startYear, startMonth + index + 1, 1));

    return { date: bucketStart, dateEnd: bucketEnd, count };
  });

const springCampaignData = buildDailyData(
  "2026-03-01T00:00:00Z",
  [18, 22, 30, 44, 52, 60, 74, 63, 57, 49, 38, 35, 28, 21]
);

const hourlyVenueTraffic = buildHourlyData("2026-04-02T08:00:00Z", [4, 8, 12, 18, 22, 28, 31, 27, 19, 14, 9, 6]);

const archiveTrend = buildMonthlyData(2025, 0, [120, 138, 144, 156, 172, 168, 182, 190, 208, 224, 236, 248, 264, 272]);

const groupedDailyData: TimeHistogramSeries[] = [
  {
    name: "Community events",
    color: DATASET_COLORS[0],
    data: buildDailyData("2026-03-01T00:00:00Z", [12, 16, 20, 28, 31, 35, 42, 40, 34, 28]),
  },
  {
    name: "Partner feeds",
    color: DATASET_COLORS[1],
    data: buildDailyData("2026-03-01T00:00:00Z", [8, 10, 12, 16, 19, 18, 23, 21, 20, 14]),
  },
  {
    name: "Editorial curation",
    color: DATASET_COLORS[2],
    data: buildDailyData("2026-03-01T00:00:00Z", [4, 6, 8, 10, 12, 11, 14, 12, 9, 8]),
  },
];

const meta: Meta<typeof TimeHistogram> = {
  title: "Charts/TimeHistogram",
  component: TimeHistogram,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: springCampaignData, height: 320, bucketSizeSeconds: DAY_SECONDS } };

export const Loading: Story = { args: { data: [], height: 320, isInitialLoad: true, bucketSizeSeconds: DAY_SECONDS } };

export const Empty: Story = {
  args: { data: [], height: 320, emptyMessage: "No events fall within the selected map bounds." },
};

export const ErrorState: Story = { args: { data: [], height: 320, isError: true, onRetry: () => {} } };

export const Updating: Story = {
  args: { data: springCampaignData, height: 320, bucketSizeSeconds: DAY_SECONDS, isUpdating: true },
};

export const GroupedDatasets: Story = {
  args: { groupedData: groupedDailyData, height: 340, bucketSizeSeconds: DAY_SECONDS },
};

export const HourlyActivity: Story = {
  args: { data: hourlyVenueTraffic, height: 300, bucketSizeSeconds: HOUR_SECONDS },
};

export const ZoomableArchive: Story = {
  args: {
    data: archiveTrend,
    height: 340,
    bucketSizeSeconds: MONTH_SECONDS,
    showDataZoom: true,
    dataZoomStart: 35,
    dataZoomEnd: 100,
  },
};
