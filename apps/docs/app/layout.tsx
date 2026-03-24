/**
 * Root layout for documentation site.
 * @module
 */
import "nextra-theme-docs/style.css";
import "./globals.css";

// Transparent logos for light and dark themes
import logoDark from "@timetiles/assets/logos/latest/dark/transparent/wordmark_horizontal.svg";
import logoLight from "@timetiles/assets/logos/latest/light/transparent/wordmark_horizontal.svg";
import Image from "next/image";
import Link from "next/link";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";

export const metadata = {
  title: "TimeTiles Documentation",
  description: "Documentation for TimeTiles - Turn your spreadsheets into interactive map stories",
};

const SOCIAL_LINKS = {
  website: "https://timetiles.io",
  github: "https://github.com/jfilter/timetiles",
  mastodon: "https://fakten.daten.cool/@timetiles",
  bluesky: "https://bsky.app/profile/timetiles.io",
};

const navbar = (
  <Navbar
    logo={
      <div className="tt-logo">
        <Image src={logoLight} alt="TimeTiles" height={28} width={105} className="tt-logo-light" />
        <Image src={logoDark} alt="TimeTiles" height={28} width={105} className="tt-logo-dark" />
      </div>
    }
    projectLink={SOCIAL_LINKS.github}
  >
    <div className="tt-nav-links">
      <Link href="/overview" className="tt-nav-link">
        Docs
      </Link>
      <Link href="/reference/api" className="tt-nav-link">
        API Reference
      </Link>
    </div>
  </Navbar>
);

const SocialIcon = ({
  href,
  label,
  children,
}: Readonly<{ href: string; label: string; children: React.ReactNode }>) => (
  <a href={href} target="_blank" rel="noopener noreferrer me" aria-label={label} className="tt-social-icon">
    {children}
  </a>
);

const footer = (
  <Footer>
    <div className="tt-footer">
      <div className="tt-footer-top">
        <div className="tt-footer-brand">
          <div className="tt-logo" style={{ marginBottom: "0.5rem" }}>
            <Image src={logoLight} alt="TimeTiles" height={24} width={90} className="tt-logo-light" />
            <Image src={logoDark} alt="TimeTiles" height={24} width={90} className="tt-logo-dark" />
          </div>
          <p className="tt-footer-tagline">Turn your spreadsheets into interactive map stories.</p>
        </div>

        <div className="tt-footer-links">
          <div className="tt-footer-col">
            <h4 className="tt-footer-heading">Resources</h4>
            <Link href="/overview">Overview</Link>
            <Link href="/quick-start">Quick Start</Link>
            <Link href="/guide">Guide</Link>
            <Link href="/reference/api">API Reference</Link>
          </div>
          <div className="tt-footer-col">
            <h4 className="tt-footer-heading">Community</h4>
            <a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={SOCIAL_LINKS.mastodon} target="_blank" rel="noopener noreferrer me">
              Mastodon
            </a>
            <a href={SOCIAL_LINKS.bluesky} target="_blank" rel="noopener noreferrer">
              Bluesky
            </a>
            <a href={SOCIAL_LINKS.website} target="_blank" rel="noopener noreferrer">
              timetiles.io
            </a>
          </div>
        </div>
      </div>

      <div className="tt-footer-bottom">
        <div className="tt-footer-social">
          <SocialIcon href={SOCIAL_LINKS.mastodon} label="Mastodon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M21.327 8.566c0-4.339-2.843-5.61-2.843-5.61-1.433-.658-3.894-.935-6.451-.956h-.063c-2.557.021-5.016.298-6.45.956 0 0-2.843 1.272-2.843 5.61 0 .993-.019 2.181.012 3.441.103 4.243.778 8.425 4.701 9.463 1.809.479 3.362.579 4.612.51 2.268-.126 3.541-.809 3.541-.809l-.075-1.646s-1.621.511-3.441.449c-1.804-.062-3.707-.194-3.999-2.409a4.523 4.523 0 0 1-.04-.621s1.77.432 4.014.535c1.372.063 2.658-.08 3.965-.236 2.506-.299 4.688-1.843 4.962-3.254.434-2.223.398-5.424.398-5.424zm-3.353 5.59h-2.081V9.057c0-1.075-.452-1.62-1.357-1.62-1 0-1.501.647-1.501 1.927v2.791h-2.069V9.364c0-1.28-.501-1.927-1.502-1.927-.904 0-1.357.545-1.357 1.62v5.099H6.026V8.903c0-1.074.273-1.927.823-2.558.566-.631 1.307-.955 2.228-.955 1.065 0 1.872.41 2.405 1.228l.518.869.519-.869c.533-.818 1.34-1.228 2.405-1.228.92 0 1.662.324 2.228.955.549.631.822 1.484.822 2.558v5.253z" />
            </svg>
          </SocialIcon>
          <SocialIcon href={SOCIAL_LINKS.bluesky} label="Bluesky">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.643 3.593 3.519 6.178 3.279-3.91.567-5.323 2.484-2.977 5.502C6.376 22.424 10.27 22.772 12 18.44c1.73 4.332 5.624 3.984 8.175.588 2.346-3.018.933-4.935-2.977-5.502 2.585.24 5.393-.636 6.178-3.279C23.622 9.418 24 4.458 24 3.768c0-.688-.139-1.86-.902-2.203-.659-.3-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
            </svg>
          </SocialIcon>
          <SocialIcon href={SOCIAL_LINKS.github} label="GitHub">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </SocialIcon>
          <SocialIcon href={SOCIAL_LINKS.website} label="Website">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </SocialIcon>
        </div>
        <p className="tt-footer-copy">
          © {new Date().getFullYear()} TimeTiles &middot;{" "}
          <a href="https://github.com/jfilter/timetiles/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
            AGPL-3.0
          </a>{" "}
          &middot; Funded by the{" "}
          <a href="https://prototypefund.de" target="_blank" rel="noopener noreferrer">
            Prototype Fund
          </a>{" "}
          (BMBF)
        </p>
      </div>
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
