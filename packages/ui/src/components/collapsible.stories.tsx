/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "Components/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-[520px] border-b">
      <CollapsibleTrigger>
        How does schema detection decide which column is the event date?
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="text-muted-foreground pb-4 text-sm">
        The detector looks for strongly date-like values, header keywords, and consistency across sampled rows before
        proposing the mapping.
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const FaqGroup: Story = {
  render: () => (
    <div className="w-[560px] space-y-2">
      <Collapsible defaultOpen className="border-b">
        <CollapsibleTrigger>
          Can editors review an import before it publishes?
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground pb-4 text-sm">
          Yes. Enable the approval step to pause after validation so reviewers can confirm the field mapping and sample
          records.
        </CollapsibleContent>
      </Collapsible>
      <Collapsible className="border-b">
        <CollapsibleTrigger>
          What happens if geocoding fails for some rows?
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground pb-4 text-sm">
          Failed rows remain visible in the review report so editors can fix or skip them without restarting the whole
          import.
        </CollapsibleContent>
      </Collapsible>
      <Collapsible className="border-b">
        <CollapsibleTrigger>
          Can I re-run a scheduled source manually?
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground pb-4 text-sm">
          Manual triggers are available from the scheduled import detail screen and use the same pipeline stages as the
          next automatic run.
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
};
