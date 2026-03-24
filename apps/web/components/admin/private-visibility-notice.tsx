/**
 * Notice component for private visibility when feature is restricted.
 *
 * Shows a warning message next to the isPublic checkbox in Payload admin
 * when private imports are disabled via feature flags.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin Components
 */
"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useAdminFeatureFlag } from "@/lib/hooks/use-admin-feature-flag";

import { AdminNotice } from "./admin-notice";

const INFO_ICON = "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

export const PrivateVisibilityNotice = () => {
  const t = useTranslations("Admin");
  const { isEnabled } = useAdminFeatureFlag("allowPrivateImports");

  // Don't render anything while loading or if private imports are allowed
  if (isEnabled === null || isEnabled) {
    return null;
  }

  return (
    <AdminNotice variant="info" icon={INFO_ICON}>
      {t("privateVisibilityRestricted")}
    </AdminNotice>
  );
};

export default PrivateVisibilityNotice;
