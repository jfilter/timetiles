/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";

const datasetRows = [
  {
    name: "Berlin Civic Events",
    source: "Open Data Portal",
    updated: "Apr 15, 2026",
    status: "Healthy",
    events: "12,480",
    statusClassName: "bg-emerald-100 text-emerald-800",
  },
  {
    name: "Neighborhood Workshops",
    source: "Community Uploads",
    updated: "Apr 14, 2026",
    status: "Needs review",
    events: "1,284",
    statusClassName: "bg-amber-100 text-amber-900",
  },
  {
    name: "Museum Late Openings",
    source: "Scheduled Feed",
    updated: "Apr 13, 2026",
    status: "Draft",
    events: "428",
    statusClassName: "bg-slate-200 text-slate-800",
  },
  {
    name: "Transit Accessibility Alerts",
    source: "Partner API",
    updated: "Apr 11, 2026",
    status: "Healthy",
    events: "6,912",
    statusClassName: "bg-emerald-100 text-emerald-800",
  },
];

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Table {...args} className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>Dataset</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Last import</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Events</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {datasetRows.map((row) => (
          <TableRow key={row.name}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.source}</TableCell>
            <TableCell>{row.updated}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.statusClassName}`}>
                {row.status}
              </span>
            </TableCell>
            <TableCell className="text-right">{row.events}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const SelectedRow: Story = {
  render: () => (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>Dataset</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Coverage</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Events</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">City Festivals</TableCell>
          <TableCell>Operations Team</TableCell>
          <TableCell>Berlin</TableCell>
          <TableCell>Healthy</TableCell>
          <TableCell className="text-right">8,204</TableCell>
        </TableRow>
        <TableRow data-state="selected">
          <TableCell className="font-medium">Cultural Grants Calendar</TableCell>
          <TableCell>Editorial Team</TableCell>
          <TableCell>Germany</TableCell>
          <TableCell>Ready for review</TableCell>
          <TableCell className="text-right">2,176</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Public Lecture Series</TableCell>
          <TableCell>Education Desk</TableCell>
          <TableCell>Hamburg</TableCell>
          <TableCell>Healthy</TableCell>
          <TableCell className="text-right">964</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithCaptionAndFooter: Story = {
  render: () => (
    <Table className="min-w-[760px]">
      <TableCaption>Scheduled imports synced in the last 24 hours across civic and cultural feeds.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Pipeline</TableHead>
          <TableHead>Cadence</TableHead>
          <TableHead>Last run</TableHead>
          <TableHead className="text-right">Imported events</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Berlin Open Data</TableCell>
          <TableCell>Hourly</TableCell>
          <TableCell>08:15 CET</TableCell>
          <TableCell className="text-right">542</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Museum Partner Feed</TableCell>
          <TableCell>Daily</TableCell>
          <TableCell>06:00 CET</TableCell>
          <TableCell className="text-right">118</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Volunteer Uploads</TableCell>
          <TableCell>Manual</TableCell>
          <TableCell>Yesterday</TableCell>
          <TableCell className="text-right">37</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total imported today</TableCell>
          <TableCell className="text-right">697</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
