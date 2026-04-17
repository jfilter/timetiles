/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Compass, Globe2, MapPinned } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { Header } from "./header";
import { HeaderActions } from "./header-actions";
import { HeaderBrand } from "./header-brand";
import { HeaderNav, HeaderNavItem } from "./header-nav";

const meta: Meta<typeof Header> = {
  title: "Layout/Header",
  component: Header,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["marketing", "app"] }, decorative: { control: "boolean" } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const navigationItems = [
  { href: "#explore", label: "Explore", active: true },
  { href: "#datasets", label: "Datasets" },
  { href: "#catalogs", label: "Catalogs" },
  { href: "#docs", label: "Docs" },
];

const renderMarketingHeader = (args: ComponentProps<typeof Header>) => (
  <div className="bg-background min-h-[20rem]">
    <Header {...args}>
      <HeaderBrand>
        <a href="#home" className="flex items-center gap-3" aria-label="TimeTiles home">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
            <MapPinned className="size-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg">TimeTiles</span>
            <span className="text-muted-foreground font-sans text-[10px] font-medium tracking-[0.24em] uppercase">
              Community Atlas
            </span>
          </span>
        </a>
      </HeaderBrand>

      <HeaderNav>
        {navigationItems.map((item) => (
          <HeaderNavItem key={item.href} href={item.href} active={item.active}>
            {item.label}
          </HeaderNavItem>
        ))}
      </HeaderNav>

      <HeaderActions>
        <Button variant="ghost" size="sm" className="hidden md:inline-flex">
          Changelog
        </Button>
        <Button variant="outline" size="icon" aria-label="Open globe settings">
          <Globe2 className="size-4" />
        </Button>
        <Button size="sm">Request Demo</Button>
      </HeaderActions>
    </Header>

    <main className="mx-auto max-w-5xl px-6 py-12 md:px-8">
      <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
        The marketing header keeps the brand, primary navigation, and call to action visible while users browse the
        public site.
      </p>
    </main>
  </div>
);

const renderAppHeader = (args: ComponentProps<typeof Header>) => (
  <div className="bg-muted/20 min-h-[20rem]">
    <Header {...args}>
      <HeaderBrand>
        <a href="#workspace" className="flex items-center gap-3" aria-label="Open import workspace">
          <span className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-full">
            <Compass className="size-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg">Import Workspace</span>
            <span className="text-muted-foreground font-sans text-[10px] font-medium tracking-[0.24em] uppercase">
              Berlin Mobility Feed
            </span>
          </span>
        </a>
      </HeaderBrand>

      <HeaderNav>
        <HeaderNavItem href="#overview" active>
          Overview
        </HeaderNavItem>
        <HeaderNavItem href="#validation">Validation</HeaderNavItem>
        <HeaderNavItem href="#geocoding">Geocoding</HeaderNavItem>
      </HeaderNav>

      <HeaderActions>
        <span className="text-muted-foreground hidden font-medium tracking-wide md:inline-flex">
          Draft saved 2 min ago
        </span>
        <Button variant="outline" size="sm">
          View Logs
        </Button>
        <Button size="sm">Publish Dataset</Button>
      </HeaderActions>
    </Header>

    <main className="mx-auto max-w-5xl px-6 py-12 md:px-8">
      <div className="border-border bg-card grid gap-4 rounded-sm border p-6 shadow-sm md:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-sm">Rows validated</p>
          <p className="text-2xl font-semibold">12,847</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Mapped locations</p>
          <p className="text-2xl font-semibold">97.4%</p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Last import</p>
          <p className="text-2xl font-semibold">April 17, 2026</p>
        </div>
      </div>
    </main>
  </div>
);

export const Default: Story = { render: (args) => renderMarketingHeader(args) };

export const DecorativeMarketing: Story = { args: { decorative: true }, render: (args) => renderMarketingHeader(args) };

export const AppShell: Story = { args: { variant: "app" }, render: (args) => renderAppHeader(args) };
