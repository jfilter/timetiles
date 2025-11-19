/**
 * Tests for Button component variants.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { buttonVariants } from "../../src/components/button";

describe("buttonVariants", () => {
  describe("default variant", () => {
    it("returns correct classes for default variant and size", () => {
      const classes = buttonVariants();
      expect(classes).toContain("bg-primary");
      expect(classes).toContain("text-primary-foreground");
      expect(classes).toContain("h-9");
    });
  });

  describe("variants", () => {
    it("applies destructive variant classes", () => {
      const classes = buttonVariants({ variant: "destructive" });
      expect(classes).toContain("bg-destructive");
      expect(classes).toContain("text-white");
    });

    it("applies outline variant classes", () => {
      const classes = buttonVariants({ variant: "outline" });
      expect(classes).toContain("border");
      expect(classes).toContain("border-input");
    });

    it("applies secondary variant classes", () => {
      const classes = buttonVariants({ variant: "secondary" });
      expect(classes).toContain("bg-secondary");
      expect(classes).toContain("text-secondary-foreground");
    });

    it("applies ghost variant classes", () => {
      const classes = buttonVariants({ variant: "ghost" });
      expect(classes).toContain("hover:bg-accent");
    });

    it("applies link variant classes", () => {
      const classes = buttonVariants({ variant: "link" });
      expect(classes).toContain("text-primary");
      expect(classes).toContain("underline-offset-4");
    });
  });

  describe("sizes", () => {
    it("applies small size classes", () => {
      const classes = buttonVariants({ size: "sm" });
      expect(classes).toContain("h-8");
    });

    it("applies large size classes", () => {
      const classes = buttonVariants({ size: "lg" });
      expect(classes).toContain("h-10");
    });

    it("applies icon size classes", () => {
      const classes = buttonVariants({ size: "icon" });
      expect(classes).toContain("size-9");
    });
  });

  describe("combinations", () => {
    it("combines variant and size correctly", () => {
      const classes = buttonVariants({ variant: "destructive", size: "sm" });
      expect(classes).toContain("bg-destructive");
      expect(classes).toContain("h-8");
    });

    it("includes custom className", () => {
      const classes = buttonVariants({ className: "custom-class" });
      expect(classes).toContain("custom-class");
    });
  });

  describe("base classes", () => {
    it("always includes base classes", () => {
      const classes = buttonVariants();
      expect(classes).toContain("inline-flex");
      expect(classes).toContain("items-center");
      expect(classes).toContain("justify-center");
      expect(classes).toContain("rounded-md");
    });

    it("includes focus-visible styles", () => {
      const classes = buttonVariants();
      expect(classes).toContain("focus-visible:border-ring");
    });

    it("includes disabled styles", () => {
      const classes = buttonVariants();
      expect(classes).toContain("disabled:pointer-events-none");
      expect(classes).toContain("disabled:opacity-50");
    });
  });
});
