import React from "react";
import { DocsThemeConfig } from "nextra-theme-docs";
import logoHorizontal from "@timetiles/assets/logos/static/logo-with-text-horizontal-tight.svg";
import faviconPng from "@timetiles/assets/logos/static/logo-256.png";

const config: DocsThemeConfig = {
  logo: (
    <>
      <img src={logoHorizontal} alt="TimeTiles" style={{ height: '40px' }} />
    </>
  ),
  project: {
    link: "https://github.com/jfilter/timetiles",
  },
  docsRepositoryBase: "https://github.com/jfilter/timetiles/tree/main/apps/docs",
  footer: {
    text: "TimeTiles Documentation",
  },
  useNextSeoProps() {
    return {
      titleTemplate: "%s – TimeTiles",
    };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="TimeTiles Documentation" />
      <meta
        property="og:description"
        content="Comprehensive documentation for TimeTiles - A spatial data management platform"
      />
      <link rel="icon" href={typeof faviconPng === 'string' ? faviconPng : faviconPng.src} />
      <link rel="shortcut icon" href={typeof faviconPng === 'string' ? faviconPng : faviconPng.src} />
    </>
  ),
  sidebar: {
    titleComponent({ title, type }) {
      if (type === "separator") {
        return <span className="cursor-default">{title}</span>;
      }
      return <>{title}</>;
    },
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  editLink: {
    text: "Edit this page on GitHub →",
  },
  feedback: {
    content: "Question? Give us feedback →",
    labels: "feedback",
  },
  search: {
    placeholder: "Search documentation...",
  },
};

export default config;
