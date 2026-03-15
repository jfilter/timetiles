/**
 * Layout for the explore page that hides the footer and fills full viewport.
 *
 * View transitions between map and list are handled natively by the
 * View Transitions API (enabled in next.config.mjs).
 *
 * @module
 */
export default function ExploreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style>{`
        footer { display: none !important; }
      `}</style>
      {children}
    </>
  );
}
