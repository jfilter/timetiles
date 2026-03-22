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

import React from "react";

import { FeatureDisabledBanner } from "./feature-disabled-banner";

export const ScheduledIngestsBanner = () => (
  <FeatureDisabledBanner
    featureFlag="enableScheduledIngests"
    title="Scheduled Imports Disabled"
    description="Creating new scheduled imports is currently disabled by an administrator. Existing schedules can still be viewed and edited."
  />
);

export default ScheduledIngestsBanner;
