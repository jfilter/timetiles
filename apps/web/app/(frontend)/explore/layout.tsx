/**
 * Layout for the explore page that hides the footer and fills full viewport.
 *
 * Includes a subtle fade animation when switching between map and list views.
 *
 * @module
 */
import { AnimatedView } from "./_components/animated-view";

export default function ExploreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style>{`
        footer { display: none !important; }
      `}</style>
      <AnimatedView>{children}</AnimatedView>
    </>
  );
}
