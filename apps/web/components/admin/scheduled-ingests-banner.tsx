/**
 * Banner for scheduled imports collection when feature is disabled.
 *
 * Shows a warning message in the Payload admin when scheduled imports
 * creation is disabled via feature flags.
 *
 * @module
 * @category Admin Components
 */
"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { FeatureDisabledBanner } from "./feature-disabled-banner";

export const ScheduledIngestsBanner = () => {
  const t = useTranslations("Admin");

  return (
    <FeatureDisabledBanner
      featureFlag="enableScheduledIngests"
      title={t("scheduledImportsDisabled")}
      description={t("scheduledImportsDisabledDescription")}
    />
  );
};

export default ScheduledIngestsBanner;
