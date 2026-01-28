import type { ComponentType, ReactNode } from "react";
import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";

type MDXComponents = Record<string, ComponentType<{ children?: ReactNode }>>;

const docsComponents = getDocsMDXComponents();

export const useMDXComponents = (components?: MDXComponents) => ({
  ...docsComponents,
  ...components,
});
