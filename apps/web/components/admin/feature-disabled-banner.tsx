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

import React, { useEffect, useState } from "react";

interface FeatureDisabledBannerProps {
  featureFlag: string;
  title: string;
  description: string;
}

// Styles defined outside component to satisfy react-perf/jsx-no-new-object-as-prop
const styles = {
  container: {
    background: "#fef3c7",
    border: "1px solid #fcd34d",
    borderRadius: "8px",
    padding: "16px 20px",
    marginBottom: "24px",
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  iconContainer: {
    flexShrink: 0,
    marginTop: "2px",
  },
  icon: {
    width: "20px",
    height: "20px",
    color: "#d97706",
  },
  content: {
    flex: 1,
  },
  title: {
    margin: "0 0 4px 0",
    fontSize: "14px",
    fontWeight: 600,
    color: "#92400e",
  },
  description: {
    margin: 0,
    fontSize: "13px",
    color: "#a16207",
    lineHeight: 1.5,
  },
  hidden: {
    display: "none",
  },
} as const;

interface FeatureFlags {
  [key: string]: boolean;
}

export const FeatureDisabledBanner = ({ featureFlag, title, description }: FeatureDisabledBannerProps) => {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const response = await fetch("/api/feature-flags");
        if (response.ok) {
          const flags = (await response.json()) as FeatureFlags;
          setIsEnabled(flags[featureFlag] ?? true);
        }
      } catch {
        // Default to enabled if fetch fails
        setIsEnabled(true);
      }
    };

    void fetchFlags();
  }, [featureFlag]);

  // Don't render anything while loading or if enabled
  if (isEnabled === null || isEnabled) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.iconContainer}>
        <svg style={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div style={styles.content}>
        <h4 style={styles.title}>{title}</h4>
        <p style={styles.description}>{description}</p>
      </div>
    </div>
  );
};

export default FeatureDisabledBanner;
