/**
 * @module
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarRange, Globe2, MapPinned } from "lucide-react";
import type { ComponentProps } from "react";

import {
  TestimonialAuthor,
  TestimonialAvatar,
  TestimonialCard,
  TestimonialMeta,
  TestimonialQuote,
  Testimonials,
} from "./testimonials";

const meta: Meta<typeof Testimonials> = {
  title: "Layout/Testimonials",
  component: Testimonials,
  tags: ["autodocs"],
  argTypes: { variant: { control: "select", options: ["grid", "single", "masonry"] } },
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const testimonials = [
  {
    quote:
      "TimeTiles gave our archive a way to show fifty years of community events on a map without flattening the story into a spreadsheet export.",
    author: "Mina Heller",
    meta: "Archivist, Berlin Neighborhood Museum",
    avatar: <MapPinned className="size-5" />,
  },
  {
    quote:
      "The import review flow is the first one our newsroom interns could use without a handoff document or a rescue call from engineering.",
    author: "Owen Patel",
    meta: "Interactive Editor, Local Dispatch",
    avatar: <CalendarRange className="size-5" />,
  },
  {
    quote:
      "We moved from scattered regional calendars to a shared public atlas, and the map filters finally reflect how our researchers actually work.",
    author: "Dr. Sofia Martin",
    meta: "Program Lead, Civic Data Lab",
    avatar: <Globe2 className="size-5" />,
  },
  {
    quote:
      "The design system pieces feel editorial instead of generic, which made stakeholder reviews much easier the moment we opened Storybook.",
    author: "Julian Reyes",
    meta: "Product Designer, Public Media Studio",
    avatar: <MapPinned className="size-5" />,
  },
  {
    quote:
      "Our outreach team uses the same dataset for newsletters, event pages, and internal planning because the publishing workflow now has one source of truth.",
    author: "Leonie Berg",
    meta: "Operations Manager, Festival Network",
    avatar: <CalendarRange className="size-5" />,
  },
];

const renderTestimonials = (args: ComponentProps<typeof Testimonials>, itemCount: number) => (
  <Testimonials {...args}>
    {testimonials.slice(0, itemCount).map((testimonial, index) => (
      <TestimonialCard key={testimonial.author} index={index}>
        <TestimonialAvatar>{testimonial.avatar}</TestimonialAvatar>
        <TestimonialQuote>{testimonial.quote}</TestimonialQuote>
        <TestimonialAuthor>{testimonial.author}</TestimonialAuthor>
        <TestimonialMeta>{testimonial.meta}</TestimonialMeta>
      </TestimonialCard>
    ))}
  </Testimonials>
);

export const Default: Story = { render: (args) => renderTestimonials(args, 1) };

export const Grid: Story = { args: { variant: "grid" }, render: (args) => renderTestimonials(args, 3) };

export const Masonry: Story = { args: { variant: "masonry" }, render: (args) => renderTestimonials(args, 5) };
