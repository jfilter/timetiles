/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Layers3, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { LabeledSlider } from "./labeled-slider";
import { MapControlButton } from "./map-control-button";
import { MapControlPopover } from "./map-control-popover";
import { PresetButtonGroup } from "./preset-button-group";

type DensityPreset = "fine" | "balanced" | "coarse";

const densityOptions = [
  { key: "fine", label: "Fine" },
  { key: "balanced", label: "Balanced" },
  { key: "coarse", label: "Coarse" },
] satisfies Array<{ key: DensityPreset; label: string }>;

const meta: Meta<typeof MapControlPopover> = {
  title: "Components/MapControlPopover",
  component: MapControlPopover,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const MapControlPanelStory = ({ open = true }: { open?: boolean }) => {
  const [density, setDensity] = useState<DensityPreset>("balanced");
  const [radius, setRadius] = useState(14);
  const radiusByDensity: Record<DensityPreset, number> = { fine: 8, balanced: 14, coarse: 22 };

  return (
    <div className="border-border bg-muted/30 h-[240px] w-[320px] rounded-sm border p-4">
      <MapControlPopover
        open={open}
        onOpenChange={() => {}}
        widthClass="w-64"
        trigger={({ onClick, isOpen }) => (
          <MapControlButton onClick={onClick} aria-label="Open clustering controls" aria-pressed={isOpen}>
            <SlidersHorizontal className="h-4 w-4" />
          </MapControlButton>
        )}
      >
        <div className="space-y-4">
          <div className="text-foreground flex items-center gap-2 text-sm font-medium">
            <Layers3 className="h-4 w-4" />
            Cluster density
          </div>
          <PresetButtonGroup
            options={densityOptions}
            value={density}
            onChange={(value) => {
              setDensity(value);
              setRadius(radiusByDensity[value]);
            }}
          />
          <LabeledSlider
            label="Cluster radius"
            value={radius}
            onChange={setRadius}
            min={4}
            max={28}
            minLabel="Detailed"
            maxLabel="Overview"
          />
          <p className="text-muted-foreground text-xs">
            Use a tighter radius for dense downtown event maps, or widen it for regional overviews.
          </p>
        </div>
      </MapControlPopover>
    </div>
  );
};

export const Default: Story = { render: () => <MapControlPanelStory /> };

export const Closed: Story = { render: () => <MapControlPanelStory open={false} /> };
