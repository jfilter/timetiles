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

import React from "react";

import { useAdminFeatureFlag } from "@/lib/hooks/use-admin-feature-flag";

// Styles defined outside component (Tailwind unavailable in Payload admin panel)
const styles = {
  notice: {
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    borderRadius: "6px",
    padding: "10px 14px",
    marginTop: "8px",
    marginBottom: "8px",
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "13px",
  },
  icon: { width: "16px", height: "16px", color: "#0284c7", flexShrink: 0, marginTop: "1px" },
  text: { color: "#0369a1", margin: 0, lineHeight: 1.4 },
} as const;

export const PrivateVisibilityNotice = () => {
  const { isEnabled } = useAdminFeatureFlag("allowPrivateImports");

  // Don't render anything while loading or if private imports are allowed
  if (isEnabled === null || isEnabled) {
    return null;
  }

  return (
    <div style={styles.notice}>
      <svg style={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p style={styles.text}>
        Private visibility is currently restricted. All new catalogs and datasets must be public. Contact an
        administrator to enable private content.
      </p>
    </div>
  );
};

export default PrivateVisibilityNotice;
