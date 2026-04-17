/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapPinned, Rss } from "lucide-react";
import type { ComponentProps } from "react";

import {
  Footer,
  FooterBottom,
  FooterBottomContent,
  FooterBrand,
  FooterColumn,
  FooterContent,
  FooterCopyright,
  FooterCredits,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
} from "./footer";
import { GitHubIcon } from "./icons/git-hub-icon";

const meta: Meta<typeof Footer> = {
  title: "Layout/Footer",
  component: Footer,
  tags: ["autodocs"],
  argTypes: { size: { control: "select", options: ["default", "sm", "lg"] } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const resourcesLinks = [
  { href: "#docs", label: "Documentation" },
  { href: "#api", label: "API Reference" },
  { href: "#storybook", label: "Design System" },
];

const communityLinks = [
  { href: "#github", label: "GitHub Repository" },
  { href: "#roadmap", label: "Public Roadmap" },
  { href: "#newsletter", label: "Release Notes" },
];

const renderFooter = (args: ComponentProps<typeof Footer>, columns: 2 | 3 = 3) => (
  <Footer {...args}>
    <FooterContent columns={columns}>
      <FooterBrand>
        <FooterLogo>
          <a href="#home" className="inline-flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-full">
              <MapPinned className="size-6" />
            </span>
            <span className="font-serif text-3xl font-bold">TimeTiles</span>
          </a>
        </FooterLogo>
        <FooterTagline>
          Open-source infrastructure for importing, geocoding, and publishing event data on maps that invite exploration
          instead of hiding the details.
        </FooterTagline>
        <div className="mt-6 flex gap-4">
          <a href="#github" className="text-foreground/60 hover:text-primary transition-colors" aria-label="GitHub">
            <GitHubIcon className="size-5" />
          </a>
          <a
            href="#newsletter"
            className="text-foreground/60 hover:text-primary transition-colors"
            aria-label="Newsletter"
          >
            <Rss className="size-5" />
          </a>
        </div>
      </FooterBrand>

      <FooterColumn>
        <FooterSection>
          <FooterSectionTitle>Resources</FooterSectionTitle>
          <FooterLinks>
            {resourcesLinks.map((link) => (
              <FooterLink key={link.href}>
                <a href={link.href}>{link.label}</a>
              </FooterLink>
            ))}
          </FooterLinks>
        </FooterSection>
      </FooterColumn>

      <FooterColumn>
        <FooterSection>
          <FooterSectionTitle>Community</FooterSectionTitle>
          <FooterLinks>
            {communityLinks.map((link) => (
              <FooterLink key={link.href}>
                <a href={link.href}>{link.label}</a>
              </FooterLink>
            ))}
          </FooterLinks>
        </FooterSection>
      </FooterColumn>
    </FooterContent>

    <FooterBottom>
      <FooterBottomContent>
        <FooterCopyright>
          © 2026 TimeTiles contributors. Built for civic archives, researchers, and local newsrooms.
        </FooterCopyright>
        <FooterCredits>Made in Berlin with Payload, PostGIS, and a very opinionated map aesthetic.</FooterCredits>
      </FooterBottomContent>
    </FooterBottom>
  </Footer>
);

export const Default: Story = { render: (args) => renderFooter(args) };

export const Compact: Story = { args: { size: "sm" }, render: (args) => renderFooter(args, 2) };

export const Expanded: Story = { args: { size: "lg" }, render: (args) => renderFooter(args) };
