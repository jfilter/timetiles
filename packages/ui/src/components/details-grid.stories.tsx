/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Globe2, Mail, MapPinned, Users } from "lucide-react";
import type { ComponentProps } from "react";

import { DetailsGrid, DetailsIcon, DetailsItem, DetailsLabel, DetailsValue } from "./details-grid";

const meta: Meta<typeof DetailsGrid> = {
  title: "Layout/DetailsGrid",
  component: DetailsGrid,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["grid-2", "grid-3", "grid-4", "compact"] } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const contactDetails = [
  { label: "Headquarters", value: "Kreuzberg, Berlin", icon: <MapPinned className="size-5" /> },
  {
    label: "Support",
    value: <a href="mailto:support@timetiles.org">support@timetiles.org</a>,
    icon: <Mail className="size-5" />,
  },
  {
    label: "Coverage",
    value: "Public event data from local feeds, newsroom archives, and research projects.",
    icon: <Globe2 className="size-5" />,
  },
  {
    label: "Contributors",
    value: "Designers, civic technologists, and maintainers collaborating across Europe.",
    icon: <Users className="size-5" />,
  },
];

const renderDetails = (args: ComponentProps<typeof DetailsGrid>, itemCount = 3) => (
  <DetailsGrid {...args}>
    {contactDetails.slice(0, itemCount).map((detail, index) => (
      <DetailsItem key={detail.label} index={index}>
        <DetailsIcon>{detail.icon}</DetailsIcon>
        <DetailsLabel>{detail.label}</DetailsLabel>
        <DetailsValue>{detail.value}</DetailsValue>
      </DetailsItem>
    ))}
  </DetailsGrid>
);

export const Default: Story = { render: (args) => renderDetails(args) };

export const GridTwo: Story = { args: { variant: "grid-2" }, render: (args) => renderDetails(args, 2) };

export const GridFour: Story = { args: { variant: "grid-4" }, render: (args) => renderDetails(args, 4) };

export const Compact: Story = { args: { variant: "compact" }, render: (args) => renderDetails(args, 4) };
