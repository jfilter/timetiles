/**
 * Banner component to display when a feature is disabled.
 *
 * Used in Payload admin collection list views to inform users
 * that creation is disabled via feature flags.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin Components
 */
"use client";

import React from "react";

import { useAdminFeatureFlag } from "@/lib/hooks/use-admin-feature-flag";
import type { FeatureFlags } from "@/lib/services/feature-flag-service";

import { AdminNotice } from "./admin-notice";

const WARNING_ICON =
  "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z";

interface FeatureDisabledBannerProps {
  featureFlag: keyof FeatureFlags;
  title: string;
  description: string;
}

export const FeatureDisabledBanner = ({ featureFlag, title, description }: FeatureDisabledBannerProps) => {
  const { isEnabled } = useAdminFeatureFlag(featureFlag);

  // Don't render anything while loading or if enabled
  if (isEnabled === null || isEnabled) {
    return null;
  }

  return (
    <AdminNotice variant="warning" icon={WARNING_ICON} title={title}>
      {description}
    </AdminNotice>
  );
};
