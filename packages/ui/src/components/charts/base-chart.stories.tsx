/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { EChartsOption } from "echarts";

import { defaultDarkTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";

const monthlyEventVolumeConfig: EChartsOption = {
  tooltip: { trigger: "axis" },
  grid: { left: "4%", right: "4%", bottom: "6%", top: "10%", containLabel: true },
  xAxis: { type: "category", data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], boundaryGap: true },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: [120, 164, 198, 244, 212, 286], itemStyle: { borderRadius: [4, 4, 0, 0] } }],
};

const sourceBreakdownConfig: EChartsOption = {
  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
  grid: { left: "4%", right: "6%", bottom: "4%", top: "8%", containLabel: true },
  xAxis: { type: "value" },
  yAxis: { type: "category", data: ["Open data", "Partner API", "CSV uploads", "Scheduled feed", "Community form"] },
  series: [
    { type: "bar", data: [486, 312, 221, 188, 94], itemStyle: { borderRadius: [0, 4, 4, 0], color: "#5f9e6e" } },
  ],
};

const attendanceLeadTimeConfig: EChartsOption = {
  tooltip: { trigger: "item" },
  grid: { left: "6%", right: "5%", bottom: "6%", top: "10%", containLabel: true },
  xAxis: { type: "value", name: "Attendance", nameLocation: "middle", nameGap: 28 },
  yAxis: { type: "value", name: "Lead time (days)", nameLocation: "middle", nameGap: 40 },
  series: [
    {
      type: "scatter",
      symbolSize: 12,
      data: [
        [80, 7],
        [120, 10],
        [145, 14],
        [172, 21],
        [210, 18],
        [255, 28],
        [290, 35],
        [340, 42],
      ],
      itemStyle: { color: "#cd853f" },
    },
  ],
};

const meta: Meta<typeof BaseChart> = {
  title: "Charts/BaseChart",
  component: BaseChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { config: monthlyEventVolumeConfig, height: 320, skeletonVariant: "histogram" } };

export const Loading: Story = {
  args: { config: monthlyEventVolumeConfig, height: 320, isInitialLoad: true, skeletonVariant: "histogram" },
};

export const Updating: Story = {
  args: { config: monthlyEventVolumeConfig, height: 320, isUpdating: true, skeletonVariant: "histogram" },
};

export const HorizontalBar: Story = { args: { config: sourceBreakdownConfig, height: 300, skeletonVariant: "bar" } };

export const ScatterDistribution: Story = {
  args: { config: attendanceLeadTimeConfig, height: 320, skeletonVariant: "scatter" },
};

export const DarkTheme: Story = {
  args: { config: monthlyEventVolumeConfig, height: 320, theme: defaultDarkTheme, skeletonVariant: "histogram" },
};
