/**
 * Root layout for documentation site.
 * @module
 */
import "nextra-theme-docs/style.css";

import logoHorizontal from "@timetiles/assets/logos/static/logo-with-text-horizontal-tight.svg";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";

export const metadata = {
  title: "TimeTiles Documentation",
  description: "Documentation for TimeTiles - Turn your spreadsheets into interactive map stories",
};

const navbar = (
  <Navbar
    logo={
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <img src={logoHorizontal} alt="TimeTiles" style={{ height: "32px" }} />
      </div>
    }
    projectLink="https://github.com/jfilter/timetiles"
  />
);

const footer = (
  <Footer>
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <p>© {new Date().getFullYear()} TimeTiles. All rights reserved.</p>
    </div>
  </Footer>
);

const banner = (
  <Banner storageKey="development-disclaimer" dismissible>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
      <span style={{ fontSize: "1.2em" }}>⚠️</span>
      <span>
        <strong>Active Development Notice:</strong> TimeTiles is under active development. Information may be
        placeholder content or not up-to-date.
      </span>
    </div>
  </Banner>
);

// Function to filter out dynamic routes from the page map
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filterPageMap = (pageMap: any): any => {
  if (Array.isArray(pageMap)) {
    return pageMap
      .filter((item) => {
        // Filter out items with dynamic segments in the route
        return !item.route?.includes("[");
      })
      .map((item) => {
        if (item.children) {
          return {
            ...item,
            children: filterPageMap(item.children),
          };
        }
        return item;
      });
  }
  return pageMap;
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let pageMap = [];

  try {
    const rawPageMap = await getPageMap();
    if (rawPageMap) {
      pageMap = filterPageMap(rawPageMap) || [];
    }
  } catch {
    // Silently handle error - pageMap will be empty
    pageMap = [];
  }

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head faviconGlyph="📍" />
      <body suppressHydrationWarning>
        <Layout
          pageMap={pageMap}
          navbar={navbar}
          footer={footer}
          banner={banner}
          docsRepositoryBase="https://github.com/jfilter/timetiles/tree/main/apps/docs"
          editLink="Edit this page on GitHub"
          sidebar={{
            defaultMenuCollapseLevel: 2,
            toggleButton: true,
            defaultOpen: true,
          }}
          toc={{
            backToTop: true,
          }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
