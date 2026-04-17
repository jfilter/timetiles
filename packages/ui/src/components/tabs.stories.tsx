/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[520px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="datasets">Datasets</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-3">
        <h3 className="font-serif text-xl font-semibold">Catalog overview</h3>
        <p className="text-muted-foreground">
          Review import health, visible datasets, and the latest publishing activity from a single dashboard.
        </p>
      </TabsContent>
      <TabsContent value="datasets" className="space-y-3">
        <h3 className="font-serif text-xl font-semibold">Dataset inventory</h3>
        <p className="text-muted-foreground">Track which sources are public, private, or waiting on schema approval.</p>
      </TabsContent>
      <TabsContent value="activity" className="space-y-3">
        <h3 className="font-serif text-xl font-semibold">Recent activity</h3>
        <p className="text-muted-foreground">Follow imports, edits, and review actions across the workspace.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithDisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[520px]">
      <TabsList>
        <TabsTrigger value="active">Active imports</TabsTrigger>
        <TabsTrigger value="queued">Queued</TabsTrigger>
        <TabsTrigger value="archived" disabled>
          Archived
        </TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="text-muted-foreground">
        Four scheduled imports are actively polling source feeds this morning.
      </TabsContent>
      <TabsContent value="queued" className="text-muted-foreground">
        Two imports are waiting for geocoding quota to reset before they continue.
      </TabsContent>
    </Tabs>
  ),
};
