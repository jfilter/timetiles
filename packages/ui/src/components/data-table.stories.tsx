/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import { type ColumnDef, DataTable } from "./data-table";

interface DatasetRow {
  readonly id: string;
  readonly dataset: string;
  readonly source: string;
  readonly cadence: string;
  readonly owner: string;
  readonly events: number;
  readonly status: "Healthy" | "Needs review" | "Draft";
  readonly coverage: string;
  readonly summary: string;
  readonly lastRun: string;
}

interface DatasetDataTableStoryProps {
  readonly data?: DatasetRow[];
  readonly isLoading?: boolean;
  readonly loadingRowCount?: number;
  readonly emptyState?: ReactNode;
  readonly pageSize?: number;
  readonly showExpandedRows?: boolean;
}

const datasetRows: DatasetRow[] = [
  {
    id: "berlin-civic",
    dataset: "Berlin Civic Events",
    source: "Scheduled URL",
    cadence: "Daily",
    owner: "Operations",
    events: 12480,
    status: "Healthy",
    coverage: "Berlin",
    summary: "City-maintained calendar of permits, street festivals, and public consultations.",
    lastRun: "Apr 15, 2026 at 08:15",
  },
  {
    id: "museum-late",
    dataset: "Museum Late Openings",
    source: "Partner API",
    cadence: "Twice weekly",
    owner: "Culture Desk",
    events: 428,
    status: "Healthy",
    coverage: "Germany",
    summary: "Partner feed with after-hours museum programs and one-off exhibition openings.",
    lastRun: "Apr 14, 2026 at 18:30",
  },
  {
    id: "workshop-network",
    dataset: "Neighborhood Workshops",
    source: "Community upload",
    cadence: "Manual",
    owner: "Community Team",
    events: 1284,
    status: "Needs review",
    coverage: "Berlin and Brandenburg",
    summary: "Resident-submitted maker sessions, trainings, and repair cafes that need occasional schema cleanup.",
    lastRun: "Apr 13, 2026 at 11:05",
  },
  {
    id: "grant-calendar",
    dataset: "Cultural Grants Calendar",
    source: "Airtable sync",
    cadence: "Hourly",
    owner: "Editorial",
    events: 2176,
    status: "Draft",
    coverage: "Europe",
    summary: "Rolling deadlines for grants, fellowships, and residency calls tracked by the editorial team.",
    lastRun: "Apr 15, 2026 at 09:00",
  },
  {
    id: "transit-access",
    dataset: "Transit Accessibility Alerts",
    source: "Scheduled URL",
    cadence: "Daily",
    owner: "Civic Lab",
    events: 6912,
    status: "Healthy",
    coverage: "Berlin",
    summary: "Accessibility disruptions and route advisories for stations, elevators, and temporary detours.",
    lastRun: "Apr 15, 2026 at 06:45",
  },
  {
    id: "public-lectures",
    dataset: "Public Lecture Series",
    source: "CSV upload",
    cadence: "Weekly",
    owner: "Education Desk",
    events: 964,
    status: "Needs review",
    coverage: "Hamburg",
    summary: "University-hosted lectures collected from departmental submissions and partner newsletters.",
    lastRun: "Apr 12, 2026 at 16:20",
  },
  {
    id: "climate-actions",
    dataset: "Climate Action Meetups",
    source: "Typeform intake",
    cadence: "Manual",
    owner: "Advocacy Team",
    events: 312,
    status: "Draft",
    coverage: "Germany",
    summary: "Volunteer-led meetups queued for moderation before publication on the public map.",
    lastRun: "Apr 11, 2026 at 13:10",
  },
  {
    id: "food-markets",
    dataset: "Weekend Food Markets",
    source: "Partner API",
    cadence: "Daily",
    owner: "Local Guides",
    events: 1806,
    status: "Healthy",
    coverage: "Berlin",
    summary: "Recurring neighborhood food markets, tasting events, and seasonal culinary pop-ups.",
    lastRun: "Apr 15, 2026 at 07:40",
  },
  {
    id: "youth-sports",
    dataset: "Youth Sports Clinics",
    source: "Google Sheet import",
    cadence: "Weekly",
    owner: "Youth Programs",
    events: 540,
    status: "Needs review",
    coverage: "North Rhine-Westphalia",
    summary: "Municipal sports programs aggregated from club spreadsheets and district recreation offices.",
    lastRun: "Apr 10, 2026 at 09:35",
  },
  {
    id: "startup-demo",
    dataset: "Startup Demo Nights",
    source: "Notion sync",
    cadence: "Twice weekly",
    owner: "Partnerships",
    events: 226,
    status: "Healthy",
    coverage: "Munich",
    summary: "Startup showcases, community office hours, and investor demo nights around the city.",
    lastRun: "Apr 14, 2026 at 15:25",
  },
  {
    id: "civic-hackathons",
    dataset: "Civic Hackathons",
    source: "Scheduled URL",
    cadence: "Monthly",
    owner: "Innovation Office",
    events: 84,
    status: "Healthy",
    coverage: "Germany",
    summary: "National list of hackathons, civic design sprints, and public-sector innovation labs.",
    lastRun: "Apr 01, 2026 at 10:00",
  },
  {
    id: "heritage-walks",
    dataset: "Heritage Walking Tours",
    source: "CSV upload",
    cadence: "Daily",
    owner: "Tourism Board",
    events: 1342,
    status: "Draft",
    coverage: "Leipzig",
    summary: "Docent-led walking tours, architectural trails, and neighborhood history programs.",
    lastRun: "Apr 15, 2026 at 05:50",
  },
];

const statusClassNames: Record<DatasetRow["status"], string> = {
  Healthy: "bg-accent/15 text-accent",
  "Needs review": "bg-secondary/15 text-secondary",
  Draft: "bg-muted text-foreground",
};

const datasetColumns: ColumnDef<DatasetRow, unknown>[] = [
  {
    accessorKey: "dataset",
    header: "Dataset",
    cell: ({ row }) => (
      <div className="space-y-1">
        <div className="font-medium">{row.original.dataset}</div>
        <div className="text-muted-foreground text-xs">{row.original.coverage}</div>
      </div>
    ),
  },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "cadence", header: "Cadence" },
  { accessorKey: "owner", header: "Owner" },
  { accessorKey: "events", header: "Events", cell: ({ row }) => row.original.events.toLocaleString() },
  {
    accessorKey: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => (
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClassNames[row.original.status]}`}
      >
        {row.original.status}
      </span>
    ),
  },
];

const renderDatasetDetails = (row: DatasetRow) => (
  <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
    <div className="space-y-2">
      <p className="text-sm font-medium">Import summary</p>
      <p className="text-muted-foreground text-sm">{row.summary}</p>
    </div>
    <dl className="grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Last successful run</dt>
        <dd className="font-medium">{row.lastRun}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Publishing cadence</dt>
        <dd className="font-medium">{row.cadence}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Coverage</dt>
        <dd className="font-medium">{row.coverage}</dd>
      </div>
    </dl>
  </div>
);

const DatasetDataTableStory = ({
  data = datasetRows.slice(0, 6),
  isLoading = false,
  loadingRowCount = 5,
  emptyState,
  pageSize = 10,
  showExpandedRows = false,
}: DatasetDataTableStoryProps) => (
  <DataTable<DatasetRow, unknown>
    columns={datasetColumns}
    data={data}
    isLoading={isLoading}
    loadingRowCount={loadingRowCount}
    emptyState={emptyState}
    pageSize={pageSize}
    getRowId={(row) => row.id}
    renderExpandedRow={showExpandedRows ? renderDatasetDetails : undefined}
    className="w-[1040px] max-w-full"
  />
);

const meta: Meta<typeof DatasetDataTableStory> = {
  title: "Components/DataTable",
  component: DatasetDataTableStory,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    isLoading: { control: "boolean" },
    loadingRowCount: { control: { type: "number", min: 1, max: 8, step: 1 } },
    pageSize: { control: { type: "number", min: 3, max: 10, step: 1 } },
    showExpandedRows: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = { args: { data: [], isLoading: true, loadingRowCount: 4, pageSize: 4 } };

export const Empty: Story = {
  args: {
    data: [],
    emptyState: (
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">No imports match these filters.</p>
        <p className="text-muted-foreground text-xs">Try widening the date range or clearing the source filter.</p>
      </div>
    ),
  },
};

export const Paginated: Story = { args: { data: datasetRows, pageSize: 5 } };

export const ExpandableRows: Story = { args: { data: datasetRows.slice(0, 5), pageSize: 5, showExpandedRows: true } };
