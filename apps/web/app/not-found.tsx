/**
 * Custom 404 Not Found page with cartographic design theme.
 *
 * Features a "lost explorer" aesthetic with vintage map elements,
 * animated compass, and clear navigation back to the application.
 *
 * @module
 * @category Pages
 */
import Link from "next/link";

const gridBackgroundStyle = {
  backgroundImage: `
    linear-gradient(to right, oklch(0.35 0.06 250) 1px, transparent 1px),
    linear-gradient(to bottom, oklch(0.35 0.06 250) 1px, transparent 1px)
  `,
  backgroundSize: "40px 40px",
} as const;

export default function NotFound() {
  return (
    <div className="bg-cartographic-parchment dark:bg-cartographic-charcoal/95 relative min-h-screen overflow-hidden">
      {/* Cartographic Grid Background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={gridBackgroundStyle} />

      {/* Decorative Corner Ornaments */}
      <div className="border-cartographic-navy/20 pointer-events-none absolute left-8 top-8 h-16 w-16 border-l-2 border-t-2" />
      <div className="border-cartographic-navy/20 pointer-events-none absolute right-8 top-8 h-16 w-16 border-r-2 border-t-2" />
      <div className="border-cartographic-navy/20 pointer-events-none absolute bottom-8 left-8 h-16 w-16 border-b-2 border-l-2" />
      <div className="border-cartographic-navy/20 pointer-events-none absolute bottom-8 right-8 h-16 w-16 border-b-2 border-r-2" />

      {/* Main Content */}
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-24">
        {/* Animated Compass Rose */}
        <div className="mb-12 animate-[compass-wobble_4s_ease-in-out_infinite] opacity-20">
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-cartographic-navy dark:text-cartographic-parchment"
          >
            {/* Compass Rose - 8 points */}
            <circle cx="40" cy="40" r="2" fill="currentColor" />
            {/* North */}
            <path d="M40 10 L44 30 L40 28 L36 30 Z" fill="currentColor" />
            {/* South */}
            <path d="M40 70 L36 50 L40 52 L44 50 Z" fill="currentColor" opacity="0.6" />
            {/* East */}
            <path d="M70 40 L50 44 L52 40 L50 36 Z" fill="currentColor" opacity="0.6" />
            {/* West */}
            <path d="M10 40 L30 36 L28 40 L30 44 Z" fill="currentColor" opacity="0.6" />
            {/* NE */}
            <path d="M60 20 L46 32 L48 30 L46 28 Z" fill="currentColor" opacity="0.4" />
            {/* NW */}
            <path d="M20 20 L34 28 L32 30 L34 32 Z" fill="currentColor" opacity="0.4" />
            {/* SE */}
            <path d="M60 60 L46 48 L48 50 L46 52 Z" fill="currentColor" opacity="0.4" />
            {/* SW */}
            <path d="M20 60 L34 52 L32 50 L34 48 Z" fill="currentColor" opacity="0.4" />
            {/* Ring */}
            <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.3" />
          </svg>
        </div>

        {/* 404 Display - Large Serif Number */}
        <div className="mb-4 animate-[fade-in-up_0.6s_ease-out_forwards]">
          <h1 className="text-cartographic-charcoal dark:text-cartographic-parchment font-serif text-9xl font-bold leading-none md:text-[12rem]">
            404
          </h1>
        </div>

        {/* Decorative Coordinates */}
        <div className="text-cartographic-navy/40 dark:text-cartographic-parchment/40 mb-6 animate-[fade-in-up_0.6s_ease-out_0.1s_forwards] font-mono text-xs tracking-wider opacity-0">
          40.4°N, 40.4°W
        </div>

        {/* Headline */}
        <h2 className="text-cartographic-charcoal dark:text-cartographic-parchment mb-4 max-w-2xl animate-[fade-in-up_0.6s_ease-out_0.2s_forwards] text-center font-serif text-3xl font-bold leading-tight opacity-0 md:text-4xl">
          Off the Map
        </h2>

        {/* Description */}
        <p className="text-cartographic-navy/70 dark:text-cartographic-parchment/70 mb-12 max-w-md animate-[fade-in-up_0.6s_ease-out_0.3s_forwards] text-center font-sans text-base leading-relaxed opacity-0">
          This location doesn&apos;t appear on any of our charts. The page you&apos;re looking for has ventured into
          uncharted territory.
        </p>

        {/* Call to Action Buttons */}
        <div className="flex animate-[fade-in-up_0.6s_ease-out_0.4s_forwards] flex-col gap-4 opacity-0 sm:flex-row">
          <Link
            href="/"
            className="bg-cartographic-blue hover:bg-cartographic-blue/90 focus:ring-cartographic-blue group inline-flex items-center justify-center gap-2 rounded-sm px-8 py-4 font-sans text-sm font-medium tracking-wide text-white shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Return Home
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="transition-transform group-hover:translate-x-0.5"
            >
              <path
                d="M6 12L10 8L6 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <Link
            href="/explore"
            className="border-cartographic-navy/20 text-cartographic-charcoal hover:border-cartographic-blue hover:bg-cartographic-blue/5 hover:text-cartographic-blue focus:ring-cartographic-blue dark:text-cartographic-parchment dark:hover:bg-cartographic-blue/10 group inline-flex items-center justify-center gap-2 rounded-sm border-2 bg-transparent px-8 py-4 font-sans text-sm font-medium tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Explore Events
          </Link>
        </div>

        {/* Decorative Divider Line */}
        <div className="via-cartographic-navy/20 mt-16 h-px w-32 animate-[fade-in_0.8s_ease-out_0.5s_forwards] bg-gradient-to-r from-transparent to-transparent opacity-0" />
      </div>
    </div>
  );
}
