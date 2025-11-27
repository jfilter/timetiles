/**
 * Import page with multi-step wizard.
 *
 * This page provides a guided import wizard for uploading event data files.
 * Requires authentication to complete the import process.
 *
 * @module
 */
import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";

import { PageLayout } from "@/components/layout/page-layout";
import type { User } from "@/payload-types";

import { ImportWizard } from "./_components";

// Force dynamic rendering to read cookies on every request
export const dynamic = "force-dynamic";

const getInitialAuth = async () => {
  try {
    const payload = await getPayload({ config });
    const headersList = await headers();

    // Try auth with headers
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
    // Not authenticated - fall through to default state
  }

  return {
    isAuthenticated: false,
    isEmailVerified: false,
    userId: null,
  };
};

export default async function ImportPage() {
  const initialAuth = await getInitialAuth();

  return (
    <div className="bg-background min-h-screen">
      <PageLayout title="Import Data" maxWidth="4xl" centered>
        <div className="py-8">
          <ImportWizard initialAuth={initialAuth} />
        </div>
      </PageLayout>
    </div>
  );
}
