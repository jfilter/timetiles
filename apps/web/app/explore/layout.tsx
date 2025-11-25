/**
 * Layout for the explore page that hides the footer and fills full viewport.
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
