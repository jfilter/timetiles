/**
 * Card component usage examples.
 *
 * Demonstrates the enhanced Card component with showcase variant,
 * version tags, labels, and specification items.
 *
 * @module
 * @category Examples
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardLabel,
  CardSpec,
  CardSpecItem,
  CardTitle,
  CardVersion,
} from "../components/card";

/**
 * Example 1: Showcase Card (Logo Preview Style)
 *
 * Replicates the card design from the logo preview with:
 * - Strong border (2px navy)
 * - Version tag
 * - Labels for sections
 * - Specification grid
 */
export const ShowcaseCardExample = () => (
  <Card variant="showcase" padding="lg">
    <CardVersion>Version 1</CardVersion>

    <CardHeader>
      <CardTitle>Clean Grid with Blue Accents</CardTitle>
      <CardDescription>
        Structured grid foundation with beige cells and strategic blue highlights forming a cross pattern. Emphasizes
        coordinate precision and spatial organization.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <CardLabel>Preview</CardLabel>
      <div className="from-cartographic-parchment dark:from-muted dark:to-background flex items-center justify-center rounded-sm border bg-gradient-to-br to-white p-8">
        {/* Your preview content here */}
        <div className="text-muted-foreground text-center">Preview Area</div>
      </div>

      <CardSpec>
        <CardSpecItem label="Grid Style">Regular matrix</CardSpecItem>
        <CardSpecItem label="Accent Pattern">Center cross</CardSpecItem>
        <CardSpecItem label="Complexity">Simple, clear</CardSpecItem>
        <CardSpecItem label="Best For">Clean, modern look</CardSpecItem>
      </CardSpec>
    </CardContent>
  </Card>
);

/**
 * Example 2: Basic Showcase Card (Minimal)
 *
 * Simplified version with just title and content
 */
export const BasicShowcaseCardExample = () => (
  <Card variant="showcase" padding="default">
    <CardVersion>V2</CardVersion>
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
      <CardDescription>A brief description of what this card represents.</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">Your content here...</p>
    </CardContent>
  </Card>
);

/**
 * Example 3: Elevated Card with Specs
 *
 * Using elevated variant with hover effect and specification grid
 */
export const ElevatedCardWithSpecsExample = () => (
  <Card variant="elevated" padding="lg">
    <CardHeader>
      <CardTitle>Feature Specifications</CardTitle>
      <CardDescription>Technical details and measurements</CardDescription>
    </CardHeader>
    <CardContent>
      <CardSpec>
        <CardSpecItem label="Dimensions">1920×1080px</CardSpecItem>
        <CardSpecItem label="Format">Landscape</CardSpecItem>
        <CardSpecItem label="File Size">2.4 MB</CardSpecItem>
        <CardSpecItem label="Color Space">sRGB</CardSpecItem>
      </CardSpec>
    </CardContent>
  </Card>
);

/**
 * Example 4: Grid of Showcase Cards
 *
 * Multiple cards in a responsive grid layout
 */
export const ShowcaseCardGridExample = () => {
  const items = [
    {
      version: "Version 1",
      title: "Clean Grid",
      description: "Structured grid foundation with strategic blue highlights.",
      specs: [
        { label: "Style", value: "Regular matrix" },
        { label: "Pattern", value: "Center cross" },
      ],
    },
    {
      version: "Version 2",
      title: "Layered Tiles",
      description: "Horizontal layers showing temporal progression.",
      specs: [
        { label: "Style", value: "Layered horizontal" },
        { label: "Pattern", value: "Bottom focus" },
      ],
    },
    {
      version: "Version 3",
      title: "Map Mosaic",
      description: "Dense mosaic resembling a detailed survey map.",
      specs: [
        { label: "Style", value: "Dense mosaic" },
        { label: "Pattern", value: "Scattered data" },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title} variant="showcase" padding="lg">
          <CardVersion>{item.version}</CardVersion>
          <CardHeader>
            <CardTitle className="text-xl">{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <CardSpec>
              {item.specs.map((spec) => (
                <CardSpecItem key={spec.label} label={spec.label}>
                  {spec.value}
                </CardSpecItem>
              ))}
            </CardSpec>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/**
 * Example 5: Card with Multiple Labeled Sections
 *
 * Demonstrates using CardLabel to organize content into sections
 */
export const MultiSectionCardExample = () => (
  <Card variant="showcase" padding="lg">
    <CardVersion>Beta</CardVersion>

    <CardHeader>
      <CardTitle>Multi-Section Card</CardTitle>
      <CardDescription>Organized content with labeled sections</CardDescription>
    </CardHeader>

    <CardContent className="space-y-6">
      <div>
        <CardLabel>Light Mode Preview</CardLabel>
        <div className="rounded-sm border bg-white p-8">Light mode content</div>
      </div>

      <div>
        <CardLabel>Dark Mode Preview</CardLabel>
        <div className="bg-cartographic-charcoal rounded-sm border p-8">Dark mode content</div>
      </div>

      <div>
        <CardLabel>Specifications</CardLabel>
        <CardSpec>
          <CardSpecItem label="Theme">Dual mode</CardSpecItem>
          <CardSpecItem label="Accessibility">WCAG AA</CardSpecItem>
        </CardSpec>
      </div>
    </CardContent>
  </Card>
);

/**
 * Example 6: Comparison of Card Variants
 *
 * Shows all card variants side-by-side
 */
export const CardVariantsComparisonExample = () => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
    <Card variant="default" padding="default">
      <CardHeader>
        <CardTitle className="text-lg">Default Variant</CardTitle>
        <CardDescription>Standard card with subtle border</CardDescription>
      </CardHeader>
    </Card>

    <Card variant="elevated" padding="default">
      <CardHeader>
        <CardTitle className="text-lg">Elevated Variant</CardTitle>
        <CardDescription>Card with shadow and hover effect</CardDescription>
      </CardHeader>
    </Card>

    <Card variant="outline" padding="default">
      <CardHeader>
        <CardTitle className="text-lg">Outline Variant</CardTitle>
        <CardDescription>Transparent background with border</CardDescription>
      </CardHeader>
    </Card>

    <Card variant="showcase" padding="default">
      <CardVersion>New</CardVersion>
      <CardHeader>
        <CardTitle className="text-lg">Showcase Variant</CardTitle>
        <CardDescription>Strong border, perfect for highlighting content</CardDescription>
      </CardHeader>
    </Card>
  </div>
);
