/**
 * Shared base component for admin notice banners.
 *
 * Provides a consistent layout for warning and info notices
 * in the Payload admin panel. Accepts variant-specific colors
 * and content via props.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin Components
 */
"use client";

import type { CSSProperties } from "react";
import React from "react";

type AdminNoticeVariant = "warning" | "info";

interface AdminNoticeProps {
  variant: AdminNoticeVariant;
  icon: string;
  title?: string;
  children: React.ReactNode;
}

const variantStyles: Record<
  AdminNoticeVariant,
  { container: CSSProperties; icon: CSSProperties; title: CSSProperties; text: CSSProperties }
> = {
  warning: {
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
    icon: { width: "20px", height: "20px", color: "#d97706", flexShrink: 0, marginTop: "2px" },
    title: { margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#92400e" },
    text: { margin: 0, fontSize: "13px", color: "#a16207", lineHeight: 1.5 },
  },
  info: {
    container: {
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
    title: { margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#0369a1" },
    text: { color: "#0369a1", margin: 0, lineHeight: 1.4 },
  },
};

export const AdminNotice = ({ variant, icon, title, children }: AdminNoticeProps) => {
  const styles = variantStyles[variant];

  return (
    <div style={styles.container}>
      <svg style={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      <div style={{ flex: 1 }}>
        {title && <h4 style={styles.title}>{title}</h4>}
        <p style={styles.text}>{children}</p>
      </div>
    </div>
  );
};
