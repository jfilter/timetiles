/**
 * Layout for the flow editor page.
 *
 * Provides a full-height container for the flow editor canvas.
 *
 * @module
 * @category Layouts
 */

export default function FlowEditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="bg-background fixed inset-0 z-[60] flex flex-col overflow-hidden">{children}</div>;
}
