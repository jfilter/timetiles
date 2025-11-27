/**
 * Simplified header for Payload admin.
 *
 * Displays branding, back to site link, and theme toggle
 * above the Payload admin header for a unified experience.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin
 */
"use client";

import { useTheme } from "@payloadcms/ui";
import LogoDark from "@timetiles/assets/logos/final/dark/logo-128.png";
import LogoLight from "@timetiles/assets/logos/final/light/logo-128.png";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "timetiles-theme";

// Styles defined outside component to satisfy react-perf/jsx-no-new-object-as-prop
const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    borderBottom: "1px solid var(--theme-elevation-100)",
    background: "var(--theme-elevation-0)",
  },
  leftSection: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoImage: {
    borderRadius: "4px",
  },
  brandText: {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--theme-elevation-800)",
  },
  dashboardBadge: {
    marginLeft: "8px",
    fontSize: "12px",
    fontWeight: 400,
    color: "var(--theme-elevation-500)",
  },
  rightSection: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  backLink: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    color: "var(--theme-elevation-600)",
    textDecoration: "none",
  },
  themeButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: "4px",
    color: "var(--theme-elevation-600)",
  },
} as const;

const AdminHeader = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    // Sync to main app's localStorage
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, [theme, setTheme]);

  const logo = theme === "dark" ? LogoDark : LogoLight;

  return (
    <header style={styles.header}>
      {/* Left: Logo + Brand */}
      <div style={styles.leftSection}>
        <Image src={logo} alt="TimeTiles" width={32} height={32} style={styles.logoImage} />
        <span style={styles.brandText}>
          TimeTiles
          <span style={styles.dashboardBadge}>Dashboard</span>
        </span>
      </div>

      {/* Right: Actions */}
      <div style={styles.rightSection}>
        {/* Back to Site */}
        <Link href="/" style={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Site
        </Link>

        {/* Theme Toggle */}
        {mounted && (
          <button
            type="button"
            onClick={toggleTheme}
            style={styles.themeButton}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
      </div>
    </header>
  );
};

export default AdminHeader;
