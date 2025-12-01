/**
 * Import wizard layout with fixed header and footer.
 *
 * Provides the wizard context and renders the progress indicator
 * at the top and navigation buttons at the bottom, with scrollable
 * content in between.
 *
 * @module
 * @category Layouts
 */
import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";

import type { User } from "@/payload-types";

import { WizardLayoutClient } from "./_components/wizard-layout-client";

const getInitialAuth = async () => {
  try {
    const payload = await getPayload({ config });
    const headersList = await headers();

    const { user } = await payload.auth({ headers: headersList });

    if (user) {
      const typedUser = user as User;
      return {
        isAuthenticated: true,
        isEmailVerified: typedUser._verified === true,
        userId: typedUser.id,
      };
    }
  } catch {
    // Not authenticated
  }

  return {
    isAuthenticated: false,
    isEmailVerified: false,
    userId: null,
  };
};

export default async function ImportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initialAuth = await getInitialAuth();

  return <WizardLayoutClient initialAuth={initialAuth}>{children}</WizardLayoutClient>;
}
