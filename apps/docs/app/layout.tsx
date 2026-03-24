/**
 * Root layout for documentation site.
 * @module
 */
import "nextra-theme-docs/style.css";

// Favicon served from public/favicon.ico — no import needed
import logoHorizontal from "@timetiles/assets/logos/latest/light/no-grid/wordmark_horizontal.svg";
import Image from "next/image";
import Link from "next/link";
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
      <div style={{ display: "flex", alignItems: "center" }}>
        <Image src={logoHorizontal} alt="TimeTiles" height={32} width={120} />
      </div>
    }
    projectLink="https://github.com/jfilter/timetiles"
  >
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginLeft: "auto" }}>
      <Link href="/overview" style={{ textDecoration: "none", color: "inherit", fontWeight: 500 }}>
        Docs
      </Link>
      <Link href="/reference/api" style={{ textDecoration: "none", color: "inherit", fontWeight: 500 }}>
        API Reference
      </Link>
      <a
        href="https://github.com/jfilter/timetiles"
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", fontWeight: 500 }}
      >
        GitHub
      </a>
    </div>
  </Navbar>
);

const footer = (
  <Footer>
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <p>
        © {new Date().getFullYear()} TimeTiles. Licensed under{" "}
        <a
          href="https://github.com/jfilter/timetiles/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          AGPL-3.0
        </a>
        .
      </p>
    </div>
  </Footer>
);

const sidebarConfig = { defaultMenuCollapseLevel: 2, toggleButton: true, defaultOpen: true };

const tocConfig = { backToTop: true };

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Layout
          pageMap={await getPageMap()}
          navbar={navbar}
          footer={footer}
          banner={banner}
          docsRepositoryBase="https://github.com/jfilter/timetiles/tree/main/apps/docs"
          editLink="Edit this page on GitHub"
          sidebar={sidebarConfig}
          toc={tocConfig}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
