/**
 * Compatibility alias for Payload's native logout page.
 *
 * Payload handles the browser request so its expired session cookie reaches
 * the browser. A server-to-server logout fetch cannot clear browser cookies.
 *
 * @module
 * @category Pages
 */
import { redirect } from "next/navigation";

export default function LogoutPage() {
  redirect("/dashboard/logout");
}
