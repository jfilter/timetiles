/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  CallToAction,
  CallToActionActions,
  CallToActionContent,
  CallToActionDescription,
  CallToActionFootnote,
  CallToActionHeadline,
} from "./call-to-action";

const meta: Meta<typeof CallToAction> = {
  title: "Layout/CallToAction",
  component: CallToAction,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["centered", "split", "banner"] } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <CallToAction {...args}>
      <CallToActionContent>
        <CallToActionHeadline>Bring your next event feed onto the map in one afternoon.</CallToActionHeadline>
        <CallToActionDescription>
          Import spreadsheets, review geocoding suggestions, and publish a browsable event atlas without stitching
          together half a dozen admin tools.
        </CallToActionDescription>
        <CallToActionActions>
          <Button size="lg">Start a Dataset</Button>
          <Button variant="outline" size="lg">
            View Live Example
          </Button>
        </CallToActionActions>
        <CallToActionFootnote>
          Includes CSV, Excel, and scheduled URL imports with audit-ready change history.
        </CallToActionFootnote>
      </CallToActionContent>
    </CallToAction>
  ),
};

export const Split: Story = {
  args: { variant: "split" },
  render: (args) => (
    <CallToAction {...args}>
      <CallToActionContent>
        <div>
          <CallToActionHeadline>Give your data team an approval workflow that feels human.</CallToActionHeadline>
          <CallToActionDescription>
            Review schema detection, assign geocoding providers, and publish only after the timeline and map previews
            match what your editors expect.
          </CallToActionDescription>
          <CallToActionActions>
            <Button size="lg">Book a walkthrough</Button>
            <Button variant="outline" size="lg">
              Read implementation notes
            </Button>
          </CallToActionActions>
          <CallToActionFootnote>
            Most teams ship their first import pipeline in a single onboarding session.
          </CallToActionFootnote>
        </div>

        <div className="border-border bg-background/80 rounded-sm border p-8 shadow-sm">
          <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase">What you unlock</p>
          <ul className="mt-4 space-y-4 text-sm leading-relaxed">
            <li>Structured review steps for schema approval, validation, and re-run safety.</li>
            <li>Geospatial search, clustering, and timeline filtering from the same dataset definition.</li>
            <li>Shareable public pages with catalog-ready metadata and source attribution.</li>
          </ul>
        </div>
      </CallToActionContent>
    </CallToAction>
  ),
};

export const Banner: Story = {
  args: { variant: "banner" },
  render: (args) => (
    <CallToAction {...args}>
      <CallToActionContent>
        <CallToActionHeadline>Ready to turn scattered event feeds into a single atlas?</CallToActionHeadline>
        <CallToActionDescription>
          Launch a pilot workspace for your newsroom, archive, or civic tech team and start importing live data this
          week.
        </CallToActionDescription>
        <CallToActionActions>
          <Button variant="secondary" size="lg">
            Create Workspace
          </Button>
          <Button variant="outline" size="lg">
            Download the checklist
          </Button>
        </CallToActionActions>
        <CallToActionFootnote>
          Open source, self-hostable, and designed for teams that care about provenance.
        </CallToActionFootnote>
      </CallToActionContent>
    </CallToAction>
  ),
};
