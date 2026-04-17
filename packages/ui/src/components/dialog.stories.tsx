/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta: Meta<typeof Dialog> = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog open>
      <DialogTrigger asChild>
        <Button>Edit catalog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit catalog details</DialogTitle>
          <DialogDescription>
            Update the label, description, and visibility settings for this collection.
          </DialogDescription>
        </DialogHeader>
        <div className="text-muted-foreground space-y-3 text-sm">
          <p>Catalogs organize multiple datasets under a shared theme, geography, or editorial program.</p>
          <p>Changes here are reflected anywhere the catalog is embedded across the site.</p>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Wide: Story = {
  render: () => (
    <Dialog open>
      <DialogContent variant="wide">
        <DialogHeader>
          <DialogTitle>Review import summary</DialogTitle>
          <DialogDescription>
            Compare inferred fields, validation warnings, and destination settings before approval.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border p-4">
            <h3 className="font-medium">Detected columns</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Title, venue, start date, end date, borough, latitude, longitude
            </p>
          </div>
          <div className="rounded-sm border p-4">
            <h3 className="font-medium">Validation summary</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              1,214 rows valid, 12 rows missing a start date, 3 rows need manual geocoding.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const Fullscreen: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <Dialog open>
      <DialogContent variant="fullscreen">
        <DialogHeader>
          <DialogTitle>Expanded map view</DialogTitle>
          <DialogDescription>
            Inspect spatial clustering and timeline filters together in a larger workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted text-muted-foreground flex min-h-[60vh] items-center justify-center rounded-sm border text-sm">
          Fullscreen dialog content area
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Processing import</DialogTitle>
          <DialogDescription>
            Keep this dialog open while the system validates the file in the background.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          This variation is useful when the primary action should remain in the footer instead of the corner.
        </p>
        <DialogFooter>
          <Button variant="outline">Dismiss later</Button>
          <Button>View progress</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
