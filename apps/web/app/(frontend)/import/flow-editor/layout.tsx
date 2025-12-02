/**
 * Layout for the flow editor page.
 *
 * Provides a full-height container for the flow editor canvas.
 *
 * @module
 * @category Layouts
 */

export default function FlowEditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex h-screen flex-col overflow-hidden">{children}</div>;
}
