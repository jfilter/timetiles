/**
 * TypeScript declarations for CSS and SCSS side-effect imports.
 *
 * Required for tsgo which does not resolve CSS imports via Next.js plugins.
 * @module
 */
declare module "*.css";
declare module "*.scss";
declare module "@payloadcms/next/css";
