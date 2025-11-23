/**
 * TypeScript declarations for SVG imports.
 *
 * Allows importing SVG files as React components or static assets.
 * @module
 */
declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const content: FC<SVGProps<SVGSVGElement>>;
  export default content;
}

declare module "*.svg?url" {
  const content: string;
  export default content;
}
