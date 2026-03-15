/**
 * Global error boundary — last-resort safety net for the entire application.
 *
 * This catches errors in the root layout itself (where the normal `error.tsx`
 * boundaries cannot help). Because the root layout has failed, this component
 * must supply its own `<html>` and `<body>` tags and must NOT import anything
 * from the project — the logger, UI library, or CSS may be the cause of the
 * crash.
 *
 * @module
 * @category Components
 */
/* eslint-disable react-perf/jsx-no-new-object-as-prop -- inline styles required; Tailwind CSS unavailable in global error boundary */
"use client";

import { useEffect } from "react";

/**
 * Fallback colors derived from the TimeTiles design system, expressed as hex
 * values for maximum compatibility when CSS custom properties are unavailable.
 *
 * parchment  ~oklch(0.96 0.01 80)  -> #f5f0e8
 * charcoal   ~oklch(0.25 0 0)      -> #363636
 * navy       ~oklch(0.35 0.06 250) -> #2e4a6e
 * destructive~oklch(0.55 0.22 25)  -> #c44030
 */

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("Global error boundary caught:", error); // oxlint-disable-line no-console -- logger may be broken
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f0e8",
          color: "#363636",
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: "2rem" }}>
          {/* Warning triangle (inline SVG to avoid any external dependency) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c44030"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 1.5rem" }}
            aria-hidden="true"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>

          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
              fontSize: "1.5rem",
              fontWeight: 600,
              margin: "0 0 0.75rem",
              color: "#363636",
            }}
          >
            Something went wrong
          </h1>

          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "#2e4a6e", opacity: 0.8, margin: "0 0 2rem" }}>
            An unexpected error occurred. This is usually temporary — please try again or return to the home page.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.6rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                fontFamily: "inherit",
                border: "1px solid #2e4a6e",
                borderRadius: "0.375rem",
                backgroundColor: "transparent",
                color: "#2e4a6e",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next.js router may be broken at this level */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.6rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                fontFamily: "inherit",
                border: "1px solid transparent",
                borderRadius: "0.375rem",
                backgroundColor: "#2e4a6e",
                color: "#f5f0e8",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Return home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
