/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Layers3, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";

import {
  MobileNavDrawer,
  MobileNavDrawerContent,
  MobileNavDrawerItem,
  MobileNavDrawerLink,
  MobileNavDrawerTrigger,
} from "./mobile-nav-drawer";

const meta: Meta<typeof MobileNavDrawer> = {
  title: "Components/MobileNavDrawer",
  component: MobileNavDrawer,
  tags: ["autodocs"],
  argTypes: { defaultOpen: { control: "boolean" } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const drawerItems = [
  { href: "#explore", label: "Explore Map", active: true },
  { href: "#datasets", label: "Datasets" },
  { href: "#catalogs", label: "Catalogs" },
  { href: "#docs", label: "Documentation" },
];

const renderDrawerShell = (content: ReactNode) => (
  <div className="bg-card min-h-[30rem]">
    <div className="border-primary/20 flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full">
          <Layers3 className="size-4" />
        </span>
        <div>
          <p className="font-serif text-lg font-semibold">TimeTiles</p>
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">Mobile Navigation</p>
        </div>
      </div>
      {content}
    </div>

    <div className="px-4 py-6">
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        The drawer is normally hidden above the mobile breakpoint. These stories keep it visible for review while
        preserving the shipped component structure.
      </p>
    </div>
  </div>
);

export const Default: Story = {
  args: { defaultOpen: true },
  render: (args) =>
    renderDrawerShell(
      <MobileNavDrawer {...args}>
        <MobileNavDrawerTrigger className="md:!inline-flex" />
        <MobileNavDrawerContent className="md:!flex">
          {drawerItems.map((item) => (
            <MobileNavDrawerItem key={item.href} href={item.href} active={item.active}>
              {item.label}
            </MobileNavDrawerItem>
          ))}
          <div className="border-primary/20 my-2 border-t" />
          <div className="px-6 py-4">
            <p className="font-serif text-lg">Need help importing?</p>
            <p className="text-muted-foreground mt-2 text-sm">Open the onboarding checklist or browse setup guides.</p>
          </div>
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    ),
};

export const WithComposedLinks: Story = {
  args: { defaultOpen: true },
  render: (args) =>
    renderDrawerShell(
      <MobileNavDrawer {...args}>
        <MobileNavDrawerTrigger className="md:!inline-flex">
          <span className="flex items-center gap-2">
            <PanelLeft className="size-4" />
            Menu
          </span>
        </MobileNavDrawerTrigger>
        <MobileNavDrawerContent className="md:!flex">
          {drawerItems.map((item) => (
            <MobileNavDrawerLink key={item.href} active={item.active}>
              <a href={item.href}>{item.label}</a>
            </MobileNavDrawerLink>
          ))}
          <div className="border-primary/20 my-2 border-t" />
          <MobileNavDrawerLink>
            <a href="#signin">Sign in</a>
          </MobileNavDrawerLink>
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    ),
};

export const TriggerOnly: Story = {
  args: { defaultOpen: false },
  render: (args) =>
    renderDrawerShell(
      <MobileNavDrawer {...args}>
        <MobileNavDrawerTrigger className="md:!inline-flex" />
        <MobileNavDrawerContent className="md:!flex">
          {drawerItems.map((item) => (
            <MobileNavDrawerItem key={item.href} href={item.href} active={item.active}>
              {item.label}
            </MobileNavDrawerItem>
          ))}
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    ),
};
