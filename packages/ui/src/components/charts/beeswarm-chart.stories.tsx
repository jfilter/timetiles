/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import type { BeeswarmDataItem, BeeswarmSeries } from "./beeswarm-chart";
import { BeeswarmChart, DATASET_COLORS } from "./beeswarm-chart";

const meta: Meta<typeof BeeswarmChart> = {
  title: "Charts/BeeswarmChart",
  component: BeeswarmChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random for reproducible stories */
const seededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const ONE_DAY = 86400000;
const ONE_YEAR = 365.25 * ONE_DAY;

/**
 * Approximate Gaussian via Box-Muller (uses 2 uniform samples).
 * Returns a value centered at 0 with stddev ~1.
 */
const gaussian = (rng: () => number): number => {
  const u1 = rng() || 0.001;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

/**
 * Generate dots with a clustered distribution (3-6 hotspots).
 * Creates realistic data with dense clumps and quiet gaps.
 */
const generateDots = (count: number, startMs: number, rangeMs: number, seed = 42): BeeswarmDataItem[] => {
  const rng = seededRandom(seed);

  // Create 3-6 hotspot centers
  const numHotspots = 3 + Math.floor(rng() * 4);
  const hotspots = Array.from({ length: numHotspots }, () => ({
    center: startMs + rng() * rangeMs,
    spread: rangeMs * (0.02 + rng() * 0.08), // 2-10% of range as spread
    weight: 0.3 + rng() * 0.7, // relative weight
  }));
  const totalWeight = hotspots.reduce((s, h) => s + h.weight, 0);

  const items: BeeswarmDataItem[] = [];
  for (let i = 0; i < count; i++) {
    // Pick a hotspot weighted by importance
    let r = rng() * totalWeight;
    let hotspot = hotspots[0]!;
    for (const h of hotspots) {
      r -= h.weight;
      if (r <= 0) {
        hotspot = h;
        break;
      }
    }
    // Gaussian scatter around the hotspot center
    const x = hotspot.center + gaussian(rng) * hotspot.spread;
    items.push({ x: Math.max(startMs, Math.min(startMs + rangeMs, x)), y: 0, id: i + 1, label: `Event ${i + 1}` });
  }
  return items;
};

/**
 * Generate cluster circles with a clustered distribution.
 * Cluster sizes vary — denser time periods get larger counts.
 */
const generateClusters = (
  count: number,
  startMs: number,
  rangeMs: number,
  minSize: number,
  maxSize: number,
  seed = 99
): BeeswarmDataItem[] => {
  const rng = seededRandom(seed);

  // Create 2-4 hotspot regions for clusters
  const numHotspots = 2 + Math.floor(rng() * 3);
  const hotspots = Array.from({ length: numHotspots }, () => ({
    center: startMs + rng() * rangeMs,
    spread: rangeMs * (0.05 + rng() * 0.12),
    weight: 0.3 + rng() * 0.7,
  }));
  const totalWeight = hotspots.reduce((s, h) => s + h.weight, 0);

  const items: BeeswarmDataItem[] = [];
  for (let i = 0; i < count; i++) {
    let r = rng() * totalWeight;
    let hotspot = hotspots[0]!;
    for (const h of hotspots) {
      r -= h.weight;
      if (r <= 0) {
        hotspot = h;
        break;
      }
    }
    const x = hotspot.center + gaussian(rng) * hotspot.spread;
    const clusterCount = Math.round(minSize + rng() * (maxSize - minSize));
    items.push({
      x: Math.max(startMs, Math.min(startMs + rangeMs, x)),
      y: 0,
      id: -(i + 1),
      count: clusterCount,
      label: `+${clusterCount.toLocaleString()}`,
    });
  }
  return items;
};

/** Create a named series with a color from the palette. */
const makeSeries = (name: string, data: BeeswarmDataItem[], colorIndex = 0): BeeswarmSeries => ({
  name,
  color: DATASET_COLORS[colorIndex % DATASET_COLORS.length] ?? "#0089a7",
  data,
});

// ---------------------------------------------------------------------------
// Common dataset names and timeline anchors
// ---------------------------------------------------------------------------

const DS_BERLIN = "Berlin Open Data";
const DS_BELLINGCAT = "Bellingcat Ukraine";
const DS_COMMUNITY = "Community Events";

const start2024 = new Date("2024-01-01").getTime();
const oneYear = ONE_YEAR;
const oneWeek = 7 * ONE_DAY;
const tenYears = 10 * ONE_YEAR;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { series: [makeSeries("Events", generateDots(50, start2024, oneYear))], height: 300 },
};

export const Loading: Story = { args: { series: [], isInitialLoad: true, height: 300 } };

export const Empty: Story = { args: { series: [], height: 300 } };

export const ErrorState: Story = { args: { series: [], isError: true, height: 300, onRetry: () => {} } };

export const SmallDataset: Story = {
  args: { series: [makeSeries("Workshops", generateDots(12, start2024, oneYear, 7))], height: 300 },
};

export const MediumDataset: Story = {
  args: { series: [makeSeries("Events", generateDots(200, start2024, oneYear, 13))], height: 300 },
};

/** 500 dots — the server-side threshold before switching to clustered mode */
export const LargeIndividual: Story = {
  args: { series: [makeSeries("Events", generateDots(500, start2024, oneYear, 17))], height: 350 },
};

export const ClustersOnly: Story = {
  args: {
    series: [makeSeries("Clusters", generateClusters(40, start2024, oneYear, 500, 10000))],
    height: 300,
    maxClusterCount: 10000,
  },
};

export const MixedDotsAndClusters: Story = {
  args: {
    series: [
      makeSeries("Events", generateDots(80, start2024, oneYear, 21)),
      makeSeries("Overflow", generateClusters(15, start2024, oneYear, 200, 5000, 33), 0),
    ],
    height: 300,
    maxClusterCount: 5000,
  },
};

export const MultipleDatasets: Story = {
  args: {
    series: [
      makeSeries(DS_BERLIN, generateDots(60, start2024, oneYear, 1), 0),
      makeSeries(DS_BELLINGCAT, generateDots(45, start2024, oneYear, 2), 1),
      makeSeries(DS_COMMUNITY, generateDots(30, start2024, oneYear, 3), 2),
    ],
    height: 350,
  },
};

export const MultipleDatasetsClusters: Story = {
  args: {
    series: [
      makeSeries(DS_BERLIN, generateClusters(20, start2024, oneYear, 1000, 15000, 10), 0),
      makeSeries(DS_BELLINGCAT, generateClusters(15, start2024, oneYear, 500, 8000, 20), 1),
      makeSeries(DS_COMMUNITY, generateClusters(10, start2024, oneYear, 100, 3000, 30), 2),
    ],
    height: 350,
    maxClusterCount: 15000,
  },
};

export const SinglePoint: Story = {
  args: {
    series: [makeSeries("Events", [{ x: start2024 + oneYear / 2, y: 0, id: 1, label: "The Only Event" }])],
    height: 250,
  },
};

export const TightDateRange: Story = {
  args: { series: [makeSeries("Conference", generateDots(80, start2024, oneWeek, 55))], height: 300 },
};

export const WideSpread: Story = {
  args: { series: [makeSeries("Historical", generateDots(150, start2024 - 5 * oneYear, tenYears, 77))], height: 300 },
};

// ---------------------------------------------------------------------------
// Size variants matching the explore page layout
// ---------------------------------------------------------------------------

const compactSeries = [makeSeries("Events", generateDots(80, start2024, oneYear, 88))];
const compactClusterSeries = [
  makeSeries(DS_BERLIN, generateClusters(15, start2024, oneYear, 200, 8000, 41), 0),
  makeSeries(DS_BELLINGCAT, generateClusters(10, start2024, oneYear, 100, 5000, 42), 1),
];

/** Compact view — 200px, matches the explore page sidebar chart */
export const CompactDots: Story = { args: { series: compactSeries, height: 200 } };

/** Compact view with clusters */
export const CompactClusters: Story = { args: { series: compactClusterSeries, height: 200, maxClusterCount: 8000 } };

/** Fullscreen/expanded view — 600px, matches the explore page expand dialog */
export const FullscreenDots: Story = {
  args: { series: [makeSeries("Events", generateDots(200, start2024, oneYear, 91))], height: 600 },
};

/** Fullscreen with clusters */
export const FullscreenClusters: Story = {
  args: {
    series: [
      makeSeries(DS_BERLIN, generateClusters(25, start2024, oneYear, 500, 12000, 51), 0),
      makeSeries(DS_BELLINGCAT, generateClusters(20, start2024, oneYear, 200, 8000, 52), 1),
      makeSeries(DS_COMMUNITY, generateClusters(12, start2024, oneYear, 50, 3000, 53), 2),
    ],
    height: 600,
    maxClusterCount: 12000,
  },
};

// ---------------------------------------------------------------------------
// Row layout — each series on its own horizontal lane
// ---------------------------------------------------------------------------

/** 3 datasets as separate rows with individual dots */
export const RowsDots: Story = {
  args: {
    series: [
      makeSeries(DS_BERLIN, generateDots(60, start2024, oneYear, 1), 0),
      makeSeries(DS_BELLINGCAT, generateDots(45, start2024, oneYear, 2), 1),
      makeSeries(DS_COMMUNITY, generateDots(30, start2024, oneYear, 3), 2),
    ],
    layout: "rows",
    height: 400,
  },
};

/** 3 datasets as separate rows with cluster circles */
export const RowsClusters: Story = {
  args: {
    series: [
      makeSeries(DS_BERLIN, generateClusters(15, start2024, oneYear, 500, 10000, 61), 0),
      makeSeries(DS_BELLINGCAT, generateClusters(12, start2024, oneYear, 200, 8000, 62), 1),
      makeSeries(DS_COMMUNITY, generateClusters(8, start2024, oneYear, 50, 3000, 63), 2),
    ],
    layout: "rows",
    height: 400,
    maxClusterCount: 10000,
  },
};

/** 5 rows — shows how the layout scales with many categories */
export const RowsMany: Story = {
  args: {
    series: [
      makeSeries("Conferences", generateDots(30, start2024, oneYear, 71), 0),
      makeSeries("Meetups", generateDots(50, start2024, oneYear, 72), 1),
      makeSeries("Workshops", generateDots(20, start2024, oneYear, 73), 2),
      makeSeries("Hackathons", generateDots(15, start2024, oneYear, 74), 3),
      makeSeries("Webinars", generateDots(40, start2024, oneYear, 75), 4),
    ],
    layout: "rows",
    height: 500,
  },
};
