// @vitest-environment jsdom
/**
 * Tests that charts keep their ECharts state (legend selection, zoom) across re-renders.
 *
 * echarts-for-react calls setOption with notMerge whenever the option prop is not
 * deep-equal, which resets user interaction state. jsdom has no canvas, so the
 * instance lifecycle is stubbed while the option comparison runs for real.
 *
 * @module
 */
import { render } from "@testing-library/react";
import ReactECharts from "echarts-for-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BarChart } from "../bar-chart";
import { TimeHistogram, type TimeHistogramSeries } from "../time-histogram";

const lifecycle = Object.getPrototypeOf(ReactECharts.prototype) as {
  renderNewEcharts: () => Promise<void>;
  getEchartsInstance: () => unknown;
  updateEChartsOption: () => unknown;
};

const fakeInstance = { on: vi.fn(), off: vi.fn(), resize: vi.fn(), setOption: vi.fn(), hideLoading: vi.fn() };
let updateOption: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(lifecycle, "renderNewEcharts").mockResolvedValue(undefined);
  vi.spyOn(lifecycle, "getEchartsInstance").mockReturnValue(fakeInstance);
  updateOption = vi.spyOn(lifecycle, "updateEChartsOption").mockReturnValue(fakeInstance);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const barData = () => [
  { label: "Alpha", value: 1200 },
  { label: "Beta", value: 30 },
];

describe("BarChart option stability", () => {
  it("does not reset the chart when re-rendered with equal props", () => {
    const { rerender } = render(<BarChart data={barData()} />);
    rerender(<BarChart data={barData()} />);

    expect(updateOption).not.toHaveBeenCalled();
  });

  it("updates the chart when the data changes", () => {
    const { rerender } = render(<BarChart data={barData()} />);
    rerender(<BarChart data={[{ label: "Gamma", value: 5 }]} />);

    expect(updateOption).toHaveBeenCalledTimes(1);
  });
});

describe("BarChart tooltip", () => {
  it("shows the full, escaped label although the axis truncates it", () => {
    let option: { tooltip?: { formatter?: (params: unknown) => string } } = {};
    vi.spyOn(lifecycle, "renderNewEcharts").mockImplementation(function (this: { props: { option: typeof option } }) {
      option = this.props.option;
      return Promise.resolve();
    });
    const label = "<img src=x> A dataset name far longer than the axis allows";
    render(<BarChart data={[{ label, value: 1200 }]} />);

    const html = option.tooltip?.formatter?.([{ data: { name: label }, value: 1200 }]) ?? "";

    expect(html).toContain("&lt;img src=x&gt; A dataset name far longer than the axis allows");
    expect(html).not.toContain("<img");
  });
});

const groupedData: TimeHistogramSeries[] = [
  { name: "A", color: "#0089a7", data: [{ date: "2024-01-01", dateEnd: "2024-02-01", count: 3 }] },
  { name: "B", color: "#cd853f", data: [{ date: "2024-01-01", dateEnd: "2024-02-01", count: 5 }] },
];

describe("TimeHistogram option stability", () => {
  it("does not reset legend selection or zoom when re-rendered with the same props", () => {
    const onDataZoomChange = vi.fn();
    const renderChart = () => (
      <TimeHistogram
        groupedData={groupedData}
        bucketSizeSeconds={2_592_000}
        showDataZoom
        dataZoomStart={10}
        dataZoomEnd={90}
        onDataZoomChange={onDataZoomChange}
        locale="en"
      />
    );
    const { rerender } = render(renderChart());
    rerender(renderChart());

    expect(updateOption).not.toHaveBeenCalled();
  });

  it("updates the chart when the zoom range changes", () => {
    const { rerender } = render(<TimeHistogram groupedData={groupedData} showDataZoom dataZoomStart={0} />);
    rerender(<TimeHistogram groupedData={groupedData} showDataZoom dataZoomStart={20} />);

    expect(updateOption).toHaveBeenCalledTimes(1);
  });
});
